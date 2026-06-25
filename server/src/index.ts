import { WebSocketServer, WebSocket } from 'ws'
import { ServerPlayer, ServerSquare } from './entities'
import { WorldStateMessage, ClientMessage, DeathScreenMessage, PlayerKilledMessage } from '../../protocol/messages'
import { TICK_MS, WORLD_WIDTH, WORLD_HEIGHT, WORLD_PADDING, PLAYER_BASE_HP, SQUARE_BASE_HP, PLAYER_COLLISION_DAMAGE, MIN_OBSTACLE_SPAWN_DIST, SQR_BASE_ROT_SPEED, MAX_SQR_ROT_SPEED, KILL_SQUARE_XP_MULTIPLIER, STEAL_PLAYER_XP_MULTIPLIER, KILL_PLAYER_BASE_XP, SQR_COLLISION_BASE_DMG, SQR_COLLISION_DMG_FACTOR, COLLISION_COOLDOWN, PLAYER_BASE_RADIUS, PLAYER_BASE_SPEED, CHUNK_ROWS, CHUNK_COLS, SHIELD_DURATION } from '../../protocol/constants'
import { circleIntersectsTriangle, currentLevel, xpForLevel } from '../../protocol/utils'
import { PlayerState, SquareState } from '../../protocol/types'
import { computeBotInput } from '../../protocol/bot-behavior'
import { activateCurrentPerks, isDrillPerk, PERK_TREE, removeDrillPerks } from '../../protocol/data/perks'
import { assignNextPlayerId, fillMapSquares, getChunkIndex, getNearbySquareIds, pickPlayerSpawnPoint, spawnBots, spawnSquaresOnStartup } from '../../protocol/world'

const PORT = 3000
const SQUARE_SPEED = 0.5  // multiplies square drifting speed

let tick = 0

const wss = new WebSocketServer({ port: PORT })
console.log(`Server running on ws://localhost:${PORT}`)

const players = new Map<number, ServerPlayer>()
const squares = new Map<number, ServerSquare>()
const playerStates: PlayerState[] = []
const squareStates: SquareState[] = []
const nearbyPlayers: PlayerState[] = []
const nearbySquareIds: number[] = []
const squaresToDelete: number[] = []
const chunkToSquares = new Map<number, Set<number>>()
for (let i = 0; i < CHUNK_ROWS * CHUNK_COLS; i++)
  chunkToSquares.set(i, new Set())

spawnSquaresOnStartup(squares)

console.log('')
wss.on('connection', (socket) => {
  const id = assignNextPlayerId()
  console.log(`${'\x1b[32m'}Player ${id} connected${'\x1b[0m'}`)

  players.set(id, {
    socket,
    state: {
      id,
      name: 'Player',
      xp: 0,
      alive: false,
      shieldActive: false,
      x: 0, 
      y: 0,
      rotation: 0,
      hp: PLAYER_BASE_HP,
      maxHp: PLAYER_BASE_HP,
      hpRegenPerSec: 0,
      moveSpeedMultiplier: 1,
      radius: 25,
      collectedPerks: [],
      drillType: 0,
      drillDmgMultiplier: 1,
      drillLengthMultiplier: 1
    },
    input: { dx: 0, dy: 0, rotation: 0 },
    shieldTicks: SHIELD_DURATION,
    lastCollisionTime: 0,
    wanderAngle: Math.random() * Math.PI * 2,
  })
  // S->C: Tell this client their assigned id
  socket.send(JSON.stringify({ type: 'welcome', id, gems: 10 })) // TODO: load actual gems count for online mode

  socket.on('close', (code, reason) => {
    players.delete(id)
    console.log(`${'\x1b[31m'}Player ${id} disconnected${'\x1b[0m'}  ${'\x1b[2m'}code: ${code}  reason: ${reason.toString() || '—'}${'\x1b[0m'}`)
    })

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientMessage
      if (msg.type === 'input') {
        players.get(id)!.input = {
          dx: msg.dx,
          dy: msg.dy,
          rotation: msg.rotation,
        }
      } else if (msg.type === 'respawn') {
        const p = players.get(id)!
        if (p.state.alive) return
        const { x, y } = pickPlayerSpawnPoint(players)
        p.state.name = msg.name
        p.state.xp *= 0.8
        p.state.alive = true
        p.state.shieldActive = true
        p.state.x = x
        p.state.y = y
        p.state.hp = PLAYER_BASE_HP
        p.state.maxHp = PLAYER_BASE_HP
        p.state.hpRegenPerSec = 0
        p.state.moveSpeedMultiplier = 1
        p.state.radius = PLAYER_BASE_RADIUS
        p.state.collectedPerks = []
        p.state.drillType = 0
        p.state.drillDmgMultiplier = 1
        p.state.drillLengthMultiplier = 1
        p.shieldTicks = SHIELD_DURATION
      } else if (msg.type === 'select_perk') {
        const player = players.get(id)!
        if (!player.state.alive) return
        const perk = PERK_TREE[msg.perkId]
        if (!perk) return
        if (player.state.collectedPerks.includes(msg.perkId)) return // prevent duplicates
        if (removeDrillPerks && isDrillPerk(msg.perkId)) removeDrillPerks(player.state)
        player.state.collectedPerks.push(msg.perkId)
        activateCurrentPerks(player.state)
      }
    } catch (e) {
      console.error('[connection handler crash]', e)
    }
  })
})

setInterval(() => {
  try {
    tick++

    // 1) Process player/bots input
    for (const p of players.values()) {
      if (!p.state.alive) continue
      p.state.x = Math.max(WORLD_PADDING, Math.min(WORLD_WIDTH - WORLD_PADDING, p.state.x + p.input.dx * p.state.moveSpeedMultiplier * PLAYER_BASE_SPEED))
      p.state.y = Math.max(WORLD_PADDING, Math.min(WORLD_HEIGHT - WORLD_PADDING, p.state.y + p.input.dy * p.state.moveSpeedMultiplier * PLAYER_BASE_SPEED))
      p.state.rotation = p.input.rotation

      // 2) Process spawn shield timers + hp regen
      if (p.shieldTicks > 0) {
        p.shieldTicks--
        if (p.shieldTicks === 0) p.state.shieldActive = false
      }
      p.state.hp = Math.min(p.state.hp + p.state.hpRegenPerSec, p.state.maxHp)
    }
    
    // 3) Check for collisions
      for (const [idA, a] of players) { // 1. player to player collisions
        if (!a.state.alive) continue
        for (const [idB, b] of players) {
          if (!b.state.alive || idB <= idA) continue
          const dx = a.state.x - b.state.x
          const dy = a.state.y - b.state.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const radiusSum = a.state.radius + b.state.radius

          if (dist < radiusSum && dist > 0.001) {
            if (!a.state.shieldActive && Date.now() - a.lastCollisionTime >= COLLISION_COOLDOWN) {
              a.state.hp -= PLAYER_COLLISION_DAMAGE
              a.lastCollisionTime = Date.now()
            }
            if (!b.state.shieldActive && Date.now() - b.lastCollisionTime >= COLLISION_COOLDOWN) {
              b.state.hp -= PLAYER_COLLISION_DAMAGE
              b.lastCollisionTime = Date.now()
            }
            if (b.state.hp <= 0 ) killPlayer(a, b, 'player') // broadcasts victim death and rewards xp to killer
            if (a.state.hp <= 0 ) killPlayer(b, a, 'player')
          }
        }
      }

        for (const [idA, a] of players) { // 2. player + drill collisions
          if (!a.state.alive) continue
          const aReach = getDrillReach(a.state)
          for (const [idB, b] of players) {
            if (!b.state.alive || idA === idB || b.state.shieldActive) continue
            const dx = a.state.x - b.state.x
            const dy = a.state.y - b.state.y
            if (dx*dx + dy*dy > (aReach + b.state.radius) ** 2) continue // broadphase
            b.state.hp -= getDrillDamageOnCircle(
              a.state.x, a.state.y, a.state.rotation, a.state.radius, 
              a.state.drillType, a.state.drillLengthMultiplier, a.state.drillDmgMultiplier,
              b.state.x, b.state.y, b.state.radius
            )
            if (b.state.hp <= 0) killPlayer(a, b, 'drill')
          }
        }

    for (const p of players.values()) {
      if (!p.state.alive) continue
      const chunkIndex = getChunkIndex(p.state.x, p.state.y)
      getNearbySquareIds(chunkToSquares, chunkIndex, nearbySquareIds) // only consider 9 nearest chunks for efficient collision checking
      const drillReach = getDrillReach(p.state)

      for (const id of nearbySquareIds) {

        const square = squares.get(id) 
        if (!square) continue
        const dx = p.state.x - square.state.x
        const dy = p.state.y - square.state.y
        const sqrDist = dx * dx + dy * dy

        if (sqrDist > (drillReach + square.boundingRadius )**2) continue

        const sqSize = 20 + (square.state.maxHp / SQUARE_BASE_HP) * 10 // 3. drill + square collisions
        const sqHalf = sqSize / 2

        square.state.hp -= getDrillDamageOnRect(
          p.state.x, p.state.y, p.state.rotation, p.state.radius,
          p.state.drillType, p.state.drillLengthMultiplier, p.state.drillDmgMultiplier,
          square.state.x, square.state.y, square.state.rotation, sqHalf, sqHalf
        )
        if (square.state.hp <= 0)
          awardXp(p, KILL_SQUARE_XP_MULTIPLIER * square.state.maxHp)


        if (circleIntersectsOrientedRect(
          p.state.x, p.state.y, p.state.radius,
          square.state.x, square.state.y, square.state.rotation, sqHalf, sqHalf // 4. player + square collisions
        )) {
          square.state.hp -= PLAYER_COLLISION_DAMAGE
          if (square.state.hp <= 0)
            awardXp(p, KILL_SQUARE_XP_MULTIPLIER * square.state.maxHp)
          if (!p.state.shieldActive && Date.now() - p.lastCollisionTime > COLLISION_COOLDOWN) {
            p.state.hp -= SQR_COLLISION_BASE_DMG + square.state.maxHp * SQR_COLLISION_DMG_FACTOR
            p.lastCollisionTime = Date.now()
          }
          if (p.state.hp <= 0) killPlayerBySquare(p)
        }
      }
    }

    // 4) Prepare bots' input for next tick
    if (tick % 3 === 0) {
      for (const p of players.values()) {
        if (p.socket !== null || !p.state.alive) continue
        nearbyPlayers.length = 0
        for (const [id, other] of players) {
          if (!other.state.alive) continue
          const dx = other.state.x - p.state.x
          const dy = other.state.y - p.state.y
          if (dx * dx + dy * dy < 800 * 800) nearbyPlayers.push(other.state)
        }
        const chunkIndex = getChunkIndex(p.state.x, p.state.y)
        getNearbySquareIds(chunkToSquares, chunkIndex, nearbySquareIds)
        computeBotInput(p, nearbyPlayers, nearbySquareIds, squares)
      }
    }

    // 5) Spawn bots
    if (tick % 50 === 0) spawnBots(players)

    // 6) Process each active square
    squaresToDelete.length = 0
    for (const sq of squares.values()) {
      if (
        sq.state.x < -WORLD_PADDING || sq.state.x > WORLD_WIDTH + WORLD_PADDING ||
        sq.state.y < -WORLD_PADDING || sq.state.y > WORLD_HEIGHT + WORLD_PADDING ||
        sq.state.hp <= 0
      ) {
        squaresToDelete.push(sq.state.id)
      } else {
        sq.pathAngle += (Math.random() - 0.5) * 0.2
        sq.state.rotation += sq.rotationSpeed
        sq.state.x += Math.cos(sq.pathAngle) * SQUARE_SPEED
        sq.state.y += Math.sin(sq.pathAngle) * SQUARE_SPEED
      }
    }

    for (const id of squaresToDelete) squares.delete(id)

    // 7) Recompute squares in each chunk
    for (const set of chunkToSquares.values()) set.clear()
    for (const [id, square] of squares) {
      const index = getChunkIndex(square.state.x, square.state.y)
      chunkToSquares.get(index)?.add(id)
    }

    // 8) Spawn new obstacles to replace old
    if (tick % 10 === 0) {
      fillMapSquares(squares, chunkToSquares, players)
    }

    // 9) Serialize world state and send to every connected client
    playerStates.length = 0
    squareStates.length = 0
    for (const p of players.values()) if (p.state.alive) playerStates.push(p.state)
    for (const sq of squares.values()) squareStates.push(sq.state)
    const message: WorldStateMessage = {
      type: 'world_state',
      players: playerStates,
      squares: squareStates,
    }

    const json = JSON.stringify(message)

    for (const p of players.values()) {
      if (p.socket && p.socket.readyState === WebSocket.OPEN) {
        p.socket.send(json)
      }
    }
  } catch (e) {
    console.error('[tick crash]', e)
  }
}, TICK_MS)

function getDrillReach(state: PlayerState): number {
  switch (state.drillType) {
    case 0: return state.radius + 40 * state.drillLengthMultiplier
    case 1: return state.radius + 40 * state.drillLengthMultiplier
    case 2: return state.radius + 30 + 30 * state.drillLengthMultiplier + 25 + 2 * state.drillLengthMultiplier
    case 3: return state.radius + 40 + 40 * state.drillLengthMultiplier + 80
    default: return state.radius
  }
}

function getDrillDamageOnCircle(originX: number, originY: number, rotation: number,
  radius: number, drillType: number, drillLengthMultiplier: number, drillDmgMultiplier: number, 
  targetX: number, targetY: number, targetRadius: number): number {
  switch (drillType) {
    case 0: return getStackedTrianglesDrillDamage(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, targetX, targetY, targetRadius)
    case 1: return getSingleTriangleDrillDamage(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, targetX, targetY, targetRadius)
    case 2: return getSawbladeDrillDamage(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, targetX, targetY, targetRadius)
    case 3: return getDeathbladeDrillDamage(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, targetX, targetY, targetRadius)
    default: return 0
  }
}

function getDrillDamageOnRect(
  originX: number, originY: number, rotation: number,
  radius: number, drillType: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): number {
  switch (drillType) {
    case 0: return stackedTrianglesDmgOnRect(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, rx, ry, rRotation, rHalfW, rHalfH)
    case 1: return singleTriangleDmgOnRect(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, rx, ry, rRotation, rHalfW, rHalfH)
    case 2: return sawbladeDmgOnRect(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, rx, ry, rRotation, rHalfW, rHalfH)
    case 3: return deathbladeDmgOnRect(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, rx, ry, rRotation, rHalfW, rHalfH)
    default: return 0
  }
}

function stackedTrianglesDmgOnRect(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): number {
  const segments = 5
  const totalLength = 40 * drillLengthMultiplier
  const segmentLength = totalLength / segments
  const startX = radius
  const baseWidth = 25
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  for (let i = 0; i < segments; i++) {
    const x = startX + i * segmentLength
    const width = baseWidth * (1 - i / segments)
    const x0 = x - segmentLength * 0.3
    const x1 = x + segmentLength

    const halfW = width / 2
    const ax = originX + x0 * cos - (-halfW) * sin
    const ay = originY + x0 * sin + (-halfW) * cos
    const bx = originX + x0 * cos -   halfW  * sin
    const by = originY + x0 * sin +   halfW  * cos
    const cx = originX + x1 * cos
    const cy = originY + x1 * sin

    if (triangleIntersectsOrientedRect(ax, ay, bx, by, cx, cy, rx, ry, rRotation, rHalfW, rHalfH)) {
      return 15 * drillDmgMultiplier
    }
  }
  return 0
}

function singleTriangleDmgOnRect(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): number {
  const startX = radius
  const width = 10
  const height = 40 * drillLengthMultiplier
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  const ax = originX + startX * cos - (-width) * sin
  const ay = originY + startX * sin + (-width) * cos
  const bx = originX + startX * cos -   width  * sin
  const by = originY + startX * sin +   width  * cos
  const cx = originX + (startX + height) * cos
  const cy = originY + (startX + height) * sin

  if (triangleIntersectsOrientedRect(ax, ay, bx, by, cx, cy, rx, ry, rRotation, rHalfW, rHalfH)) {
    return 15 * drillDmgMultiplier
  }
  return 0
}

function getStackedTrianglesDrillDamage(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  targetX: number, targetY: number, targetRadius: number
): number {
  const segments = 5
  const totalLength = 40 * drillLengthMultiplier
  const segmentLength = totalLength / segments
  const startX = radius
  const baseWidth = 25
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  for (let i = 0; i < segments; i++) {
    const x = startX + i * segmentLength
    const width = baseWidth * (1 - i / segments)
    const x0 = x - segmentLength * 0.3
    const x1 = x + segmentLength

    const halfW = width / 2
    const ax = originX + x0 * cos - (-halfW) * sin
    const ay = originY + x0 * sin + (-halfW) * cos
    const bx = originX + x0 * cos -   halfW  * sin
    const by = originY + x0 * sin +   halfW  * cos
    const cx = originX + x1 * cos
    const cy = originY + x1 * sin

    if (circleIntersectsTriangle(targetX, targetY, targetRadius, ax, ay, bx, by, cx, cy)) {
      return 15 * drillDmgMultiplier
    }
  }
  return 0
}

function getSingleTriangleDrillDamage(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  targetX: number, targetY: number, targetRadius: number
): number {
  const startX = radius
  const width = 10
  const height = 40 * drillLengthMultiplier
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  const ax = originX + startX * cos - (-width) * sin
  const ay = originY + startX * sin + (-width) * cos
  const bx = originX + startX * cos -   width  * sin
  const by = originY + startX * sin +   width  * cos
  const cx = originX + (startX + height) * cos
  const cy = originY + (startX + height) * sin

  if (circleIntersectsTriangle(targetX, targetY, targetRadius, ax, ay, bx, by, cx, cy)) {
    return 15 * drillDmgMultiplier
  }
  return 0
}

function getSawbladeDrillDamage(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  targetX: number, targetY: number, targetRadius: number
): number {
  const offset = radius + 30 + 30 * drillLengthMultiplier
  const bladeX = originX + Math.cos(rotation) * offset
  const bladeY = originY + Math.sin(rotation) * offset
  const bladeRadius = 20 + 2 * drillLengthMultiplier
  const dx = targetX - bladeX, dy = targetY - bladeY
  return dx*dx + dy*dy < (bladeRadius + targetRadius) ** 2 ? 20 * drillDmgMultiplier : 0
}

function getDeathbladeDrillDamage(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  targetX: number, targetY: number, targetRadius: number
): number {
  const offset = radius + 40 + 40 * drillLengthMultiplier
  const bladeX = originX + Math.cos(rotation) * offset
  const bladeY = originY + Math.sin(rotation) * offset
  const dx = targetX - bladeX, dy = targetY - bladeY
  return dx*dx + dy*dy < (80 + targetRadius) ** 2 ? 20 * drillDmgMultiplier : 0
}

function sawbladeDmgOnRect(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): number {
  const offset = radius + 25 + 25 * drillLengthMultiplier
  const bladeX = originX + Math.cos(rotation) * offset
  const bladeY = originY + Math.sin(rotation) * offset
  const bladeRadius = 22 + 2 * drillLengthMultiplier
  return circleIntersectsOrientedRect(bladeX, bladeY, bladeRadius, rx, ry, rRotation, rHalfW, rHalfH) ? 20 * drillDmgMultiplier : 0
}

function deathbladeDmgOnRect(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): number {
  const offset = radius + 40 + 40 * drillLengthMultiplier
  const bladeX = originX + Math.cos(rotation) * offset
  const bladeY = originY + Math.sin(rotation) * offset
  return circleIntersectsOrientedRect(bladeX, bladeY, 80, rx, ry, rRotation, rHalfW, rHalfH) ? 20 * drillDmgMultiplier : 0
}

// returns whether or not circle is inside of the rectangle
function circleIntersectsOrientedRect(
  cx: number, cy: number, circleRadius: number,  // circle
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number  // rect
): boolean {
  // transform circle center into rect local space
  const cos = Math.cos(-rRotation)
  const sin = Math.sin(-rRotation)
  const dx = cx - rx
  const dy = cy - ry
  const localX = dx * cos - dy * sin
  const localY = dx * sin + dy * cos

  // find closest point on AABB to circle center
  const closestX = Math.max(-rHalfW, Math.min(rHalfW, localX))
  const closestY = Math.max(-rHalfH, Math.min(rHalfH, localY))

  // check distance
  const distX = localX - closestX
  const distY = localY - closestY
  return distX * distX + distY * distY < circleRadius * circleRadius
}

function triangleIntersectsOrientedRect(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): boolean {
  const cos = Math.cos(-rRotation)
  const sin = Math.sin(-rRotation)

  // transform triangle into rect local space (inlined, no tuple allocations)
  let dx = ax - rx, dy = ay - ry
  const lax = dx * cos - dy * sin, lay = dx * sin + dy * cos
  dx = bx - rx; dy = by - ry
  const lbx = dx * cos - dy * sin, lby = dx * sin + dy * cos
  dx = cx - rx; dy = cy - ry
  const lcx = dx * cos - dy * sin, lcy = dx * sin + dy * cos

  // test rect axes
  if (Math.max(lax, lbx, lcx) < -rHalfW || Math.min(lax, lbx, lcx) > rHalfW) return false
  if (Math.max(lay, lby, lcy) < -rHalfH || Math.min(lay, lby, lcy) > rHalfH) return false

  // test triangle edge normals (unrolled, no array allocations)
  // edge 0: a->b
  let nx = -(lby - lay), ny = lbx - lax
  let t0 = lax*nx+lay*ny, t1 = lbx*nx+lby*ny, t2 = lcx*nx+lcy*ny
  let triMin = Math.min(t0, t1, t2), triMax = Math.max(t0, t1, t2)
  let r0 = -rHalfW*nx - rHalfH*ny, r1 = rHalfW*nx - rHalfH*ny
  let r2 = -rHalfW*nx + rHalfH*ny, r3 = rHalfW*nx + rHalfH*ny
  if (triMax < Math.min(r0,r1,r2,r3) || Math.max(r0,r1,r2,r3) < triMin) return false

  // edge 1: b->c
  nx = -(lcy - lby); ny = lcx - lbx
  t0 = lax*nx+lay*ny; t1 = lbx*nx+lby*ny; t2 = lcx*nx+lcy*ny
  triMin = Math.min(t0, t1, t2); triMax = Math.max(t0, t1, t2)
  r0 = -rHalfW*nx - rHalfH*ny; r1 = rHalfW*nx - rHalfH*ny
  r2 = -rHalfW*nx + rHalfH*ny; r3 = rHalfW*nx + rHalfH*ny
  if (triMax < Math.min(r0,r1,r2,r3) || Math.max(r0,r1,r2,r3) < triMin) return false

  // edge 2: c->a
  nx = -(lay - lcy); ny = lax - lcx
  t0 = lax*nx+lay*ny; t1 = lbx*nx+lby*ny; t2 = lcx*nx+lcy*ny
  triMin = Math.min(t0, t1, t2); triMax = Math.max(t0, t1, t2)
  r0 = -rHalfW*nx - rHalfH*ny; r1 = rHalfW*nx - rHalfH*ny
  r2 = -rHalfW*nx + rHalfH*ny; r3 = rHalfW*nx + rHalfH*ny
  if (triMax < Math.min(r0,r1,r2,r3) || Math.max(r0,r1,r2,r3) < triMin) return false

  return true
}

function killPlayer(killer: ServerPlayer, victim: ServerPlayer, cause: 'player' | 'drill') {
  if (!victim.state.alive) return
  victim.state.alive = false
  awardXp(killer, STEAL_PLAYER_XP_MULTIPLIER * victim.state.xp + KILL_PLAYER_BASE_XP)
  broadcastToAll(JSON.stringify({ // broadcast that victim died
    type: 'player_killed',
    victimId: victim.state.id,
    killerId: killer.state.id,
    victimName: victim.state.name,
    killerName: killer.state.name,
  } satisfies PlayerKilledMessage))
  victim.socket?.send(JSON.stringify({
    type: 'death_screen',
    killerName: killer.state.name,
    cause: cause
  } satisfies DeathScreenMessage))
  if (victim.socket === null) players.delete(victim.state.id) // bots are removed immediately
}

function killPlayerBySquare(victim: ServerPlayer) {
  if (!victim.state.alive) return
  victim.state.alive = false
  broadcastToAll(JSON.stringify({
    type: 'player_killed',
    victimId: victim.state.id,
    killerId: -1,
    victimName: victim.state.name,
    killerName: 'A Square',
  } satisfies PlayerKilledMessage))
  victim.socket?.send(JSON.stringify({
    type: 'death_screen',
    killerName: 'a Square',
    cause: 'square'
  } satisfies DeathScreenMessage))
  if (victim.socket === null) players.delete(victim.state.id) // bots are removed immediately
}

// helper to broadcast a message to all connected players
function broadcastToAll(json: string) {
  for (const p of players.values()) {
    if (p.socket?.readyState === WebSocket.OPEN)
      p.socket.send(json)
  }
}

function awardXp(player: ServerPlayer, amount: number) { // TODO: make xp cap be based on account progression instead of always level 7 as max
  if (currentLevel(player.state.xp) >= 7) return
  player.state.xp += amount
  if (currentLevel(player.state.xp) >= 7)
    player.state.xp = xpForLevel(7) - 1
}