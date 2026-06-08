import { WebSocketServer, WebSocket } from 'ws'
import { ServerPlayer, ServerSquare } from './entities'
import { ClientMessage, WorldStateMessage } from '../../protocol/messages'
import { TICK_MS, WORLD_WIDTH, WORLD_HEIGHT, WORLD_PADDING, PLAYER_BASE_HP, SQUARE_BASE_HP, SQUARE_COLLISION_DAMAGE_FACTOR, PLAYER_COLLISION_DAMAGE_FACTOR, MIN_OBSTACLE_SPAWN_DIST, SQR_BASE_ROT_SPEED, MAX_SQR_ROT_SPEED } from '../../protocol/constants'
import { DANGER_MAP, DENSITY_MAP } from './data/map'
import { toWorld, circleIntersectsTriangle } from '../../protocol/utils'

const PORT = 3000
const CHUNK_COLS = 16
const CHUNK_ROWS = 16
const UNIT_SPEED = 10
const SQUARE_SPEED = 0.5  // multiplies square drifting speed
const SQUARE_BASE_BOUNDING_RADIUS = 10 // used for broad phase collision

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
const chunkToSquares = new Map<number, Set<number>>()
for (let i = 0; i < CHUNK_ROWS * CHUNK_COLS; i++)
  chunkToSquares.set(i, new Set())

spawnSquaresOnStartup()

wss.on('connection', (socket) => {
  const id = nextPlayerId++

  players.set(id, {
    socket,
    state: {
      id, 
      x: 400, 
      y: 300, 
      rotation: 0,
      hp: PLAYER_BASE_HP,
      maxHp: PLAYER_BASE_HP,
      playerRadius: id % 2 === 0 ? 25 : 50, // DEBUG: temporary
      drillType: 0,
      drillDmgMultiplier: 1,
      drillLengthMultiplier: 1
    },
    input: { dx: 0, dy: 0, rotation: 0 },
  })
  // S->C: Tell this client their assigned id
  socket.send(JSON.stringify({ type: 'welcome', id }))
  console.log(`Player ${id} connected`)

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
      }
    } catch {
      // invalid JSON, ignore
    }
  })
})

setInterval(() => {
  tick++

  // 1) Process each player's input
  for (const player of players.values()) {
    player.state.x = Math.max(WORLD_PADDING, Math.min(WORLD_WIDTH - WORLD_PADDING, player.state.x + player.input.dx * UNIT_SPEED))
    player.state.y = Math.max(WORLD_PADDING, Math.min(WORLD_HEIGHT - WORLD_PADDING, player.state.y + player.input.dy * UNIT_SPEED))
    player.state.rotation = player.input.rotation
  }

  // 2) Check for collisions
    for (const [idA, a] of players) { // 1. player to player collisions
      for (const [idB, b] of players) {
        if (idB <= idA) continue
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

          a.state.hp -= PLAYER_COLLISION_DAMAGE_FACTOR * 10
          b.state.hp -= PLAYER_COLLISION_DAMAGE_FACTOR * 10
        }
      }
    }

      for (const [idA, a] of players) { // 2. player + drill collisions
        for (const [idB, b] of players) {
          if (idA === idB) continue
          b.state.hp -= getDrillDamageOnCircle(
            a.state.x, a.state.y, a.state.rotation, a.state.playerRadius, 
            a.state.drillType, a.state.drillLengthMultiplier, a.state.drillDmgMultiplier,
            b.state.x, b.state.y, b.state.playerRadius
          )
        }
      }

  for (const player of players.values()) {
    const chunkIndex = getChunkIndex(player.state.x, player.state.y)
    const nearbySquareIds = getNearbySquareIds(chunkIndex) // only consider 9 nearest chunks for efficient collision checking
    const drillReach = player.state.playerRadius + 40 * player.state.drillLengthMultiplier

    for (const id of nearbySquareIds) {

      const square = squares.get(id) 
      if (!square) continue
      const dx = player.state.x - square.state.x
      const dy = player.state.y - square.state.y
      const sqrDist = dx * dx + dy * dy

      if (sqrDist > (drillReach + square.boundingRadius )**2) continue

      const dist = Math.sqrt(sqrDist)
      const sqSize = 20 + (square.state.maxHp / SQUARE_BASE_HP) * 10
      const sqHalf = sqSize / 2

      square.state.hp -= getDrillDamageOnRect(
        player.state.x, player.state.y, player.state.rotation, player.state.playerRadius,
        player.state.drillType, player.state.drillLengthMultiplier, player.state.drillDmgMultiplier,
        square.state.x, square.state.y, square.state.rotation, sqHalf, sqHalf
      )

      if (circleIntersectsOrientedRect( // 4. player + square collisions
        player.state.x, player.state.y, player.state.playerRadius,
        square.state.x, square.state.y, square.state.rotation, sqHalf, sqHalf
      )) {
        player.state.hp -= square.state.maxHp * SQUARE_COLLISION_DAMAGE_FACTOR
        square.state.hp -= player.state.maxHp * PLAYER_COLLISION_DAMAGE_FACTOR

        // positional correction — push player out using circle-vs-AABB penetration
        const nx = dx / dist
        const ny = dy / dist
        const overlap = (player.state.playerRadius + sqHalf) - dist
        player.state.x += nx * overlap
        player.state.y += ny * overlap
      }
    }
  }

  // 3) TODO: Process current bots input

  // 4) Spawn bots
  if (tick % 60 === 0) {
    spawnBots()
  }

  // 5) Process each active square
  const toDelete: number[] = []
  
  for (const sq of squares.values()) {
    if (
      sq.state.x < -WORLD_PADDING || sq.state.x > WORLD_WIDTH + WORLD_PADDING ||
      sq.state.y < -WORLD_PADDING || sq.state.y > WORLD_HEIGHT + WORLD_PADDING ||
      sq.state.hp <= 0
    ) {
      toDelete.push(sq.state.id)
    } else {
      sq.pathAngle += (Math.random() - 0.5) * 0.2
      sq.state.rotation += sq.rotationSpeed
      sq.state.x += Math.cos(sq.pathAngle) * SQUARE_SPEED
      sq.state.y += Math.sin(sq.pathAngle) * SQUARE_SPEED
    }
  }

  for (const id of toDelete) squares.delete(id)

  // 6) Recompute squares in each chunk
  for (const set of chunkToSquares.values()) set.clear()
  for (const [id, square] of squares) {
    const index = getChunkIndex(square.state.x, square.state.y)
    chunkToSquares.get(index)?.add(id)
  }

  // 7) Spawn new obstacles to replace old
  if (tick % 10 === 0) {
    fillMapSquares()
  }

  // 8) Serialize world state and send to every connected client
  const message: WorldStateMessage = {
    type: 'world_state',
    players: Array.from(players.values()).map(p => p.state),
    squares: Array.from(squares.values()).map(p => p.state)
  }

  const json = JSON.stringify(message)

  for (const player of players.values()) {
    if (player.socket && player.socket.readyState === WebSocket.OPEN) {
      player.socket.send(json)
    }
  }
}, TICK_MS)

// Only called on server startup, afterwards use fillMapSquares()
function spawnSquaresOnStartup() {
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

function getNearbySquareIds(chunkIndex: number): number[] {
  const col = chunkIndex % CHUNK_COLS
  const row = Math.floor(chunkIndex / CHUNK_COLS)
  const ids: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nc = col + dc
      const nr = row + dr
      if (nc >= 0 && nc < CHUNK_COLS && nr >= 0 && nr < CHUNK_ROWS) {
        const neighbors = chunkToSquares.get(nr * CHUNK_COLS + nc)!
        for (const id of neighbors) ids.push(id)
      }
    }
  }
  return ids
}

function spawnBots() {
  // TODO
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

    const [ax, ay] = toWorld(x0, -width / 2, originX, originY, cos, sin)
    const [bx, by] = toWorld(x0,  width / 2, originX, originY, cos, sin)
    const [cx, cy] = toWorld(x1,          0, originX, originY, cos, sin)

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

  const [ax, ay] = toWorld(startX,        -width, originX, originY, cos, sin)
  const [bx, by] = toWorld(startX,         width, originX, originY, cos, sin)
  const [cx, cy] = toWorld(startX + height,    0, originX, originY, cos, sin)

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

    const [ax, ay] = toWorld(x0, -width / 2, originX, originY, cos, sin)
    const [bx, by] = toWorld(x0,  width / 2, originX, originY, cos, sin)
    const [cx, cy] = toWorld(x1,          0, originX, originY, cos, sin)

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

  const [ax, ay] = toWorld(startX,        -width, originX, originY, cos, sin)
  const [bx, by] = toWorld(startX,         width, originX, originY, cos, sin)
  const [cx, cy] = toWorld(startX + height,    0, originX, originY, cos, sin)

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
  // transform triangle into rect local space
  const cos = Math.cos(-rRotation)
  const sin = Math.sin(-rRotation)

  function toLocal(px: number, py: number): [number, number] {
    const dx = px - rx
    const dy = py - ry
    return [dx * cos - dy * sin, dx * sin + dy * cos]
  }

  const [lax, lay] = toLocal(ax, ay)
  const [lbx, lby] = toLocal(bx, by)
  const [lcx, lcy] = toLocal(cx, cy)

  // test rect axes (x and y — trivial in local space)
  const triMinX = Math.min(lax, lbx, lcx)
  const triMaxX = Math.max(lax, lbx, lcx)
  const triMinY = Math.min(lay, lby, lcy)
  const triMaxY = Math.max(lay, lby, lcy)

  if (triMaxX < -rHalfW || triMinX > rHalfW) return false
  if (triMaxY < -rHalfH || triMinY > rHalfH) return false

  // test triangle edge normals
  const edges = [
    [lax, lay, lbx, lby],
    [lbx, lby, lcx, lcy],
    [lcx, lcy, lax, lay],
  ] as const

  for (const [ex, ey, ex2, ey2] of edges) {
    const nx = -(ey2 - ey)
    const ny = ex2 - ex

    const triProjs = [lax*nx+lay*ny, lbx*nx+lby*ny, lcx*nx+lcy*ny]
    const triMin = Math.min(...triProjs)
    const triMax = Math.max(...triProjs)

    const rectCorners = [
      [-rHalfW, -rHalfH], [rHalfW, -rHalfH],
      [-rHalfW,  rHalfH], [rHalfW,  rHalfH],
    ]
    const rectProjs = rectCorners.map(([cx, cy]) => cx*nx + cy*ny)
    const rectMin = Math.min(...rectProjs)
    const rectMax = Math.max(...rectProjs)

    if (triMax < rectMin || rectMax < triMin) return false
  }

  return true
}

// Returns whether or not spot is available for obstacles to spawn here.
// *Only accounts for players, not other obstacles
function isSpawnClearOfPlayers(spawnX: number, spawnY: number, minDist: number): boolean {
  for (const p of players.values()) {
    const dx = p.state.x - spawnX
    const dy = p.state.y - spawnY
    if (dx * dx + dy * dy < minDist * minDist) return false
  }
  return true
}