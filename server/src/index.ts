import { WebSocketServer, WebSocket } from 'ws'
import { ServerPlayer, ServerSquare } from './entities'
import { WorldStateMessage, ClientMessage, DeathScreenMessage, PlayerKilledMessage } from '../../protocol/messages'
import { TICK_MS, WORLD_WIDTH, WORLD_HEIGHT, WORLD_PADDING, PLAYER_BASE_HP, SQUARE_BASE_HP, SQUARE_COLLISION_DAMAGE_FACTOR, PLAYER_COLLISION_DAMAGE_FACTOR, MIN_OBSTACLE_SPAWN_DIST, SQR_BASE_ROT_SPEED, MAX_SQR_ROT_SPEED, KILL_SQUARE_XP_MULTIPLIER, STEAL_PLAYER_XP_MULTIPLIER, KILL_PLAYER_BASE_XP } from '../../protocol/constants'
import { DANGER_MAP, DENSITY_MAP } from './data/map'
import { circleIntersectsTriangle, currentLevel, xpForLevel } from '../../protocol/utils'
import { PlayerState, SquareState } from '../../protocol/types'

const PORT = 3000
const MAX_PLAYER_COUNT = 20
const CHUNK_COLS = 16
const CHUNK_ROWS = 16
const UNIT_SPEED = 10
const SQUARE_SPEED = 0.5  // multiplies square drifting speed
const SQUARE_BASE_BOUNDING_RADIUS = 10 // used for broad phase collision
const SHIELD_DURATION = 50

const chunkHeat = new Float32Array(CHUNK_ROWS * CHUNK_COLS)
const HEAT_SPAWN_THRESHOLD = 10
const HEAT_RATE = 1 // per tick cycle

let tick = 0
let nextPlayerId = 0
let nextSquareId = 0

const wss = new WebSocketServer({ port: PORT })
console.log(`Server running on ws://localhost:${PORT}`)

const players = new Map<number, ServerPlayer>()
const squares = new Map<number, ServerSquare>()
const playerStates: PlayerState[] = []
const squareStates: SquareState[] = []
const nearbySquareIds: number[] = []
const squaresToDelete: number[] = []
const chunkToSquares = new Map<number, Set<number>>()
for (let i = 0; i < CHUNK_ROWS * CHUNK_COLS; i++)
  chunkToSquares.set(i, new Set())

spawnSquaresOnStartup()

wss.on('connection', (socket) => {
  const id = nextPlayerId++
  console.log(`Player ${id} connected`)

  players.set(id, {
    socket,
    state: {
      id,
      name: "Player", // TODO: allow setting name
      xp: 0,
      alive: true,
      shieldActive: true,
      x: 400, 
      y: 300,
      rotation: 0,
      hp: PLAYER_BASE_HP,
      maxHp: PLAYER_BASE_HP,
      playerRadius: 25,
      drillType: 0,
      drillDmgMultiplier: 1,
      drillLengthMultiplier: 1
    },
    input: { dx: 0, dy: 0, rotation: 0 },
    shieldTicks: SHIELD_DURATION
  })
  // S->C: Tell this client their assigned id
  socket.send(JSON.stringify({ type: 'welcome', id }))

  socket.on('close', () => {
    players.delete(id)
    console.log(`Player ${id} disconnected`)
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
        // TODO: smart spawning computes x, y
        const player = players.get(id)!
        if (player.state.alive) return
        player.state.alive = true
        player.state.hp = PLAYER_BASE_HP
        player.state.x = WORLD_WIDTH / 2
        player.state.y = WORLD_HEIGHT / 2
        player.state.shieldActive = true
        player.shieldTicks = SHIELD_DURATION
      }
    } catch {
      // invalid JSON, ignore
    }
  })
})

setInterval(() => {
  tick++

  // 1) Process each player's input
  for (const p of players.values()) {
    if (!p.state.alive) continue
    p.state.x = Math.max(WORLD_PADDING, Math.min(WORLD_WIDTH - WORLD_PADDING, p.state.x + p.input.dx * UNIT_SPEED))
    p.state.y = Math.max(WORLD_PADDING, Math.min(WORLD_HEIGHT - WORLD_PADDING, p.state.y + p.input.dy * UNIT_SPEED))
    p.state.rotation = p.input.rotation

    // 2) Process spawn shield timers
    if (p.shieldTicks > 0) {
      p.shieldTicks--
      if (p.shieldTicks === 0) p.state.shieldActive = false
    }
  }
  

  // 3) Check for collisions
    for (const [idA, a] of players) { // 1. player to player collisions
      if (!a.state.alive) continue
      for (const [idB, b] of players) {
        if (!b.state.alive || idB <= idA) continue
        const dx = a.state.x - b.state.x
        const dy = a.state.y - b.state.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const radiusSum = a.state.playerRadius + b.state.playerRadius

        if (dist < radiusSum && dist > 0.001) {
          const overlap = radiusSum - dist
          const nx = dx / dist
          const ny = dy / dist

          // positional correction — push player out of collided player
          a.state.x += nx * overlap / 2
          a.state.y += ny * overlap / 2
          b.state.x -= nx * overlap / 2
          b.state.y -= ny * overlap / 2

          if (!a.state.shieldActive) a.state.hp -= PLAYER_COLLISION_DAMAGE_FACTOR * 10
          if (!b.state.shieldActive) b.state.hp -= PLAYER_COLLISION_DAMAGE_FACTOR * 10

          if (b.state.hp <= 0 ) killPlayer(a, b, 'player') // broadcasts victim death and rewards xp to killer
          if (a.state.hp <= 0 ) killPlayer(b, a, 'player')
        }
      }
    }

      for (const [idA, a] of players) { // 2. player + drill collisions
        if (!a.state.alive) continue
        for (const [idB, b] of players) {
          if (!b.state.alive || idA === idB || b.state.shieldActive) continue
          b.state.hp -= getDrillDamageOnCircle(
            a.state.x, a.state.y, a.state.rotation, a.state.playerRadius, 
            a.state.drillType, a.state.drillLengthMultiplier, a.state.drillDmgMultiplier,
            b.state.x, b.state.y, b.state.playerRadius
          )
          if (b.state.hp <= 0) killPlayer(a, b, 'drill')
        }
      }

  for (const p of players.values()) {
    if (!p.state.alive) continue
    const chunkIndex = getChunkIndex(p.state.x, p.state.y)
    getNearbySquareIds(chunkIndex, nearbySquareIds) // only consider 9 nearest chunks for efficient collision checking
    const drillReach = p.state.playerRadius + 40 * p.state.drillLengthMultiplier

    for (const id of nearbySquareIds) {

      const square = squares.get(id) 
      if (!square) continue
      const dx = p.state.x - square.state.x
      const dy = p.state.y - square.state.y
      const sqrDist = dx * dx + dy * dy

      if (sqrDist > (drillReach + square.boundingRadius )**2) continue

      const dist = Math.sqrt(sqrDist)
      const sqSize = 20 + (square.state.maxHp / SQUARE_BASE_HP) * 10 // 3. drill + square collisions
      const sqHalf = sqSize / 2

      square.state.hp -= getDrillDamageOnRect(
        p.state.x, p.state.y, p.state.rotation, p.state.playerRadius,
        p.state.drillType, p.state.drillLengthMultiplier, p.state.drillDmgMultiplier,
        square.state.x, square.state.y, square.state.rotation, sqHalf, sqHalf
      )
      if (square.state.hp <= 0)
        awardXp(p, KILL_SQUARE_XP_MULTIPLIER * square.state.maxHp)


      if (circleIntersectsOrientedRect(
        p.state.x, p.state.y, p.state.playerRadius,
        square.state.x, square.state.y, square.state.rotation, sqHalf, sqHalf // 4. player + square collisions
      )) {
        square.state.hp -= p.state.maxHp * PLAYER_COLLISION_DAMAGE_FACTOR
        if (square.state.hp <= 0)
          awardXp(p, KILL_SQUARE_XP_MULTIPLIER * square.state.maxHp)
        if (!p.state.shieldActive) p.state.hp -= square.state.maxHp * SQUARE_COLLISION_DAMAGE_FACTOR
        if (p.state.hp <= 0) { killPlayerBySquare(p) }

        // positional correction — push player out using circle-vs-AABB penetration
        const nx = dx / dist
        const ny = dy / dist
        const overlap = (p.state.playerRadius + sqHalf) - dist
        p.state.x += nx * overlap
        p.state.y += ny * overlap
      }
    }
  }

  // 4) TODO: Process current bots input

  // 5) Spawn bots
  if (tick % 50 === 0) {
    spawnBots()
  }

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
    fillMapSquares()
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
}, TICK_MS)

function spawnSquaresOnStartup() { // Only called on server startup, afterwards use fillMapSquares()
  const chunkW = WORLD_WIDTH / CHUNK_COLS
  const chunkH = WORLD_HEIGHT / CHUNK_ROWS

  for (let row = 0; row < CHUNK_ROWS; row++) {
    for (let col = 0; col < CHUNK_COLS; col++) {
      const toSpawn = DENSITY_MAP[row * CHUNK_COLS + col]
      for (let i = 0; i < toSpawn; i++) {
        const id = assignNextSquareId()
        squares.set(id, {
          state: {
            id: id,
            x: col * chunkW + Math.random() * chunkW,
            y: row * chunkH + Math.random() * chunkH,
            hp: SQUARE_BASE_HP * DANGER_MAP[row * CHUNK_COLS + col],
            maxHp: SQUARE_BASE_HP * DANGER_MAP[row * CHUNK_COLS + col],
            rotation: Math.random() * Math.PI * 2,
          },
          pathAngle: Math.random() * Math.PI * 2,
          boundingRadius : SQUARE_BASE_BOUNDING_RADIUS * DANGER_MAP[row * CHUNK_COLS + col],
          rotationSpeed: Math.max(-MAX_SQR_ROT_SPEED, Math.min(MAX_SQR_ROT_SPEED, 
            (Math.random() - 0.5) * 2 * SQR_BASE_ROT_SPEED))
        })
      }
    }
  }
}

// Fill the map with squares up to the desired density
function fillMapSquares() {
  const chunkW = WORLD_WIDTH / CHUNK_COLS
  const chunkH = WORLD_HEIGHT / CHUNK_ROWS

  for (let row = 0; row < CHUNK_ROWS; row++) {
    for (let col = 0; col < CHUNK_COLS; col++) {
      const idx = row * CHUNK_COLS + col
      const deficit = DENSITY_MAP[idx] - chunkToSquares.get(idx)!.size
      if (deficit <= 0) { chunkHeat[idx] = 0; continue }
      chunkHeat[idx] += HEAT_RATE * deficit

      while (chunkHeat[idx] > HEAT_SPAWN_THRESHOLD) {
        chunkHeat[idx] -= HEAT_SPAWN_THRESHOLD
        const randX = col * chunkW + Math.random() * chunkW
        const randY = row * chunkH + Math.random() * chunkH
        if (!isSpawnClearOfPlayers(randX, randY, MIN_OBSTACLE_SPAWN_DIST)) continue
        const id = assignNextSquareId()
        squares.set(id, {
          state: {
            id: id,
            x: randX,
            y: randY,
            hp: SQUARE_BASE_HP * DANGER_MAP[row * CHUNK_COLS + col],
            maxHp: SQUARE_BASE_HP * DANGER_MAP[row * CHUNK_COLS + col],
            rotation: Math.random() * Math.PI * 2,
          },
          pathAngle: Math.random() * Math.PI * 2,
          boundingRadius : SQUARE_BASE_BOUNDING_RADIUS * DANGER_MAP[row * CHUNK_COLS + col],
          rotationSpeed: Math.max(-MAX_SQR_ROT_SPEED, Math.min(MAX_SQR_ROT_SPEED, 
            (Math.random() - 0.5) * 2 * SQR_BASE_ROT_SPEED))
        })
      }
    }
  }
}

function getChunkIndex(x: number, y: number): number {
  const col = Math.floor(x / (WORLD_WIDTH / CHUNK_COLS))
  const row = Math.floor(y / (WORLD_HEIGHT / CHUNK_ROWS))
  return row * CHUNK_COLS + col
}

function getNearbySquareIds(chunkIndex: number, out: number[]): void {
  out.length = 0
  const col = chunkIndex % CHUNK_COLS
  const row = Math.floor(chunkIndex / CHUNK_COLS)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nc = col + dc
      const nr = row + dr
      if (nc >= 0 && nc < CHUNK_COLS && nr >= 0 && nr < CHUNK_ROWS) {
        const neighbors = chunkToSquares.get(nr * CHUNK_COLS + nc)!
        for (const id of neighbors) out.push(id)
      }
    }
  }
}

function assignNextSquareId() {
  if (nextSquareId >= 9007199254740991)
    nextSquareId = 0
  else
    nextSquareId++
  return nextSquareId
}

function getDrillDamageOnCircle(originX: number, originY: number, rotation: number,
  playerRadius: number, drillType: number, drillLengthMultiplier: number, drillDmgMultiplier: number, 
  targetX: number, targetY: number, targetRadius: number): number {
  switch (drillType) {
    case 0: return getStackedTrianglesDrillDamage(originX, originY, rotation, playerRadius, drillLengthMultiplier, drillDmgMultiplier, targetX, targetY, targetRadius)
    case 1: return getSingleTriangleDrillDamage(originX, originY, rotation, playerRadius, drillLengthMultiplier, drillDmgMultiplier, targetX, targetY, targetRadius)
    default: return 0
  }
}

function getDrillDamageOnRect(
  originX: number, originY: number, rotation: number,
  playerRadius: number, drillType: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): number {
  switch (drillType) {
    case 0: return stackedTrianglesDmgOnRect(originX, originY, rotation, playerRadius, drillLengthMultiplier, drillDmgMultiplier, rx, ry, rRotation, rHalfW, rHalfH)
    case 1: return singleTriangleDmgOnRect(originX, originY, rotation, playerRadius, drillLengthMultiplier, drillDmgMultiplier, rx, ry, rRotation, rHalfW, rHalfH)
    default: return 0
  }
}

function stackedTrianglesDmgOnRect(
  originX: number, originY: number, rotation: number,
  playerRadius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): number {
  const segments = 5
  const totalLength = 40 * drillLengthMultiplier
  const segmentLength = totalLength / segments
  const startX = playerRadius
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
  playerRadius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): number {
  const startX = playerRadius
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
  playerRadius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  targetX: number, targetY: number, targetRadius: number
): number {
  const segments = 5
  const totalLength = 40 * drillLengthMultiplier
  const segmentLength = totalLength / segments
  const startX = playerRadius
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
  playerRadius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  targetX: number, targetY: number, targetRadius: number
): number {
  const startX = playerRadius
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

// Returns whether or not spot is available for obstacles to spawn here.
// *Only accounts for players, not other obstacles
function isSpawnClearOfPlayers(spawnX: number, spawnY: number, minDist: number): boolean {
  for (const p of players.values()) {
    const dx = p.state.x - spawnX
    const dy = p.state.y - spawnY
    if (dx * dx + dy * dy < (minDist + p.state.playerRadius)**2) return false
  }
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

const BOT_SPAWN_RADIUS = 1200

function spawnBotForPlayer(player: PlayerState) {
  let bestX = WORLD_WIDTH / 2, bestY = WORLD_HEIGHT / 2, bestScore = -1

  for (let i = 0; i < 30; i++) {
    const dx = (i/15 - 0.5) * 2 * BOT_SPAWN_RADIUS
    const dy = (i % 2 === 0 ? 1 : -1) * (BOT_SPAWN_RADIUS - Math.abs(dx))
    const x = Math.max(WORLD_PADDING, Math.min(WORLD_WIDTH - WORLD_PADDING, player.x + dx))
    const y = Math.max(WORLD_PADDING, Math.min(WORLD_HEIGHT - WORLD_PADDING, player.y + dy))
    const score = spawnPointScore(x, y, true)
    if (score > bestScore) { bestX = x; bestY = y; bestScore = score }
  }

  spawnBot(bestX, bestY)
}

function pickPlayerSpawnPoint(): { x: number, y: number } {
  let bestX = WORLD_WIDTH / 2, bestY = WORLD_HEIGHT / 2, bestScore = -1

  for (let i = 0; i < 30; i++) {
    const x = WORLD_PADDING + Math.random() * (WORLD_WIDTH - WORLD_PADDING * 2)
    const y = WORLD_PADDING + Math.random() * (WORLD_HEIGHT - WORLD_PADDING * 2)
    const score = spawnPointScore(x, y, false)
    if (score > bestScore) { bestX = x, bestY = y, bestScore = score }
  }

  return { x: bestX, y: bestY }
}

function spawnPointScore(x: number, y: number, isBot: boolean): number {
  const idealDist = 1200
  const nearest = Math.sqrt(nearestPlayerDist(x, y))
  const distScore = Math.max(0, 1 - Math.abs(nearest - idealDist) / idealDist)
  const danger = DANGER_MAP[getChunkIndex(x, y)] + 0.001 // avoid division by zero

  if (isBot) return distScore * danger
  return distScore / danger
}


function nearestPlayerDist(x: number, y: number): number {
  let minSqDist = Infinity
  for (const p of players.values()) {
    const dx = p.state.x - x
    const dy = p.state.y - y
    minSqDist = Math.min(minSqDist, dx * dx + dy * dy)
  }
  return minSqDist
}

function spawnBots() {
  const botBudget = MAX_PLAYER_COUNT - 10
  const currentBots = players.size
  if (currentBots >= botBudget) return

  // find the real player most deserving of a bot
  let bestPlayer: PlayerState | null = null
  let bestScore = -1
  for (const p of players.values()) {
    if (p.socket === null || !p.state.alive) continue
    const score = currentLevel(p.state.xp) // simple for now, expand later
    if (score > bestScore) { bestScore = score; bestPlayer = p.state }
  }

  if (bestPlayer) spawnBotForPlayer(bestPlayer)
}


function spawnBot(x: number, y: number) {
  const dangerLevel = DANGER_MAP[getChunkIndex(x, y)]
  const strengthMultiplier = dangerLevel * Math.random()
  const id = nextPlayerId++
  players.set(id, {
    socket: null,
    state: {
      id,
      name: generateBotName(),
      xp: 0,
      alive: true,
      shieldActive: true,
      x,
      y,
      rotation: 0,
      hp: PLAYER_BASE_HP * (1 + strengthMultiplier),
      maxHp: PLAYER_BASE_HP * (1 + strengthMultiplier),
      playerRadius: 20 + 12 * (strengthMultiplier),
      drillType: 0,
      drillDmgMultiplier: 0.7 + (dangerLevel - 1) * 0.1,
      drillLengthMultiplier: 0.7 + (dangerLevel * Math.min(Math.random(), 0.2)) * 0.5
    },
    input: { dx: 0, dy: 0, rotation: Math.random() * Math.PI * 2 },
    shieldTicks: SHIELD_DURATION
  })
}

const BOT_NAMES = [
  'Boreworm', 'YOURENDHASCOME', 'RealPlayer', 'Cavefish', 'Rockbreaker',
  'Deepdelver', 'Ironmaw', 'Dustcloud', 'Cobalt', 'Gravel', 'Unnamed',
  'MasterOfTheMines', 'Pitlord', 'Bedrock', 'Quarryman',
  'NotABot', 'TrulyHuman', 'JustPassingThrough',
  'WhyAmIHere', 'SendHelp', 'OopsAllDrill', 'DrillOrBeGrilled',
  'YesIAmReal', 'DefinitelyNotAI', 'Muscleman'
]

const BOT_NAME_PREFIXES = [
  'Digger', 'Mole', 'Tunneler', 'Drillbit', 'Excavator', 'Driller', 
  'Player', 'Pro', 'ProPlayer', 'Drill', 'Caveman', 'Rock', 'Iron', 
  'Dust', 'Gopher', 'Pebble', 'Boulder', 'Crater'
]

function generateBotName(): string {
  const usedNames = new Set([...players.values()].map(p => p.state.name))
  const availableFullNames = BOT_NAMES.filter(n => !usedNames.has(n))

  if (Math.random() < 0.8 && availableFullNames.length > 0)
    return availableFullNames[Math.floor(Math.random() * availableFullNames.length)]
  const prefix = BOT_NAME_PREFIXES[Math.floor(Math.random() * BOT_NAME_PREFIXES.length)]
  let digits = Math.floor(1000 + Math.random() * 9000) // always 4 digits
  const name = `${prefix}${digits}`
  while (usedNames.has(name)) digits++
  return `${prefix}${digits}`
}