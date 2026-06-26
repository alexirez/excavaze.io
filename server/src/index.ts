import { WebSocketServer, WebSocket } from 'ws'
import { ServerPlayer, ServerSquare } from './entities'
import { WorldStateMessage, ClientMessage } from '../../protocol/messages'
import { TICK_MS, WORLD_WIDTH, WORLD_HEIGHT, WORLD_PADDING, PLAYER_BASE_HP, SQUARE_BASE_HP, PLAYER_COLLISION_DAMAGE, KILL_SQUARE_XP_MULTIPLIER, SQR_COLLISION_BASE_DMG, SQR_COLLISION_DMG_FACTOR, COLLISION_COOLDOWN, PLAYER_BASE_RADIUS, PLAYER_BASE_SPEED, CHUNK_ROWS, CHUNK_COLS, SHIELD_DURATION } from '../../protocol/constants'
import { PlayerState, SquareState } from '../../protocol/types'
import { computeBotInput } from '../../protocol/bot-behavior'
import { isDrillPerk, PERK_TREE, removeDrillPerks } from '../../protocol/data/perks'
import { assignNextPlayerId, fillMapSquares, getChunkIndex, getNearbySquareIds, pickPlayerSpawnPoint, spawnBots, spawnSquaresOnStartup } from '../../protocol/world'
import { awardXp, circleIntersectsOrientedRect, getDrillDamageOnCircle, getDrillDamageOnRect, getDrillReach, killPlayer, killPlayerBySquare } from '../../protocol/combat'
import { refreshStats } from '../../protocol/utils'

const PORT = 3000
const SQUARE_SPEED = 0.5  // multiplies square drifting speed
let tick = 0

const wss = new WebSocketServer({ port: PORT })
console.log(`Server running on ws://localhost:${PORT}\n`)

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

spawnSquaresOnStartup(squares, chunkToSquares)

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
    purchasedUpgrades: []
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
        p.purchasedUpgrades = msg.upgrades ?? []
        refreshStats(p.state, p.purchasedUpgrades)
      } else if (msg.type === 'select_perk') {
        const player = players.get(id)!
        if (!player.state.alive) return
        const perk = PERK_TREE[msg.perkId]
        if (!perk) return
        if (player.state.collectedPerks.includes(msg.perkId)) return // prevent duplicates
        if (removeDrillPerks && isDrillPerk(msg.perkId)) removeDrillPerks(player.state)
        player.state.collectedPerks.push(msg.perkId)
        refreshStats(player.state, player.purchasedUpgrades)
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
            if (b.state.hp <= 0 ) killPlayer(a, b, 'player', players) // broadcasts victim death and rewards xp to killer
            if (a.state.hp <= 0 ) killPlayer(b, a, 'player', players)
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
            if (b.state.hp <= 0) killPlayer(a, b, 'drill', players)
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
          if (p.state.hp <= 0) killPlayerBySquare(p, players)
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
      if (p.socket && p.socket.readyState === WebSocket.OPEN)
        p.socket.send(json)
    }
  } catch (e) {
    console.error('[tick crash]', e)
  }
}, TICK_MS)