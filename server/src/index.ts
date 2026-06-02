import { WebSocketServer, WebSocket } from 'ws'
import { ServerPlayer, ServerSquare } from './entities'
import { ClientMessage, WorldStateMessage } from '../../protocol/messages'
import { TICK_MS, WORLD_WIDTH, WORLD_HEIGHT, WORLD_PADDING, PLAYER_BASE_HP, SQUARE_BASE_HP, SQUARE_COLLISION_DAMAGE_FACTOR, PLAYER_COLLISION_DAMAGE_FACTOR } from '../../protocol/constants'
import { DANGER_MAP, DENSITY_MAP } from './data/map'

const PORT = 3000
const CHUNK_COLS = 16
const CHUNK_ROWS = 16
const UNIT_SPEED = 10  // pixels per tick
const SQUARE_SPEED = 0.5  // multiplies speed of drifting
const PLAYER_RADIUS = 25
const SQUARE_BASE_RADIUS = 10

let tick = 0

const wss = new WebSocketServer({ port: PORT })
console.log(`Server running on ws://localhost:${PORT}`)

const players = new Map<string, ServerPlayer>()
const squares = new Map<string, ServerSquare>()
const chunkToSquares = new  Map<number, Set<string>>()
for (let i = 0; i < CHUNK_ROWS * CHUNK_COLS; i++)
  chunkToSquares.set(i, new Set())

spawnSquaresOnStartup()

wss.on('connection', (socket) => {
  const id = Math.random().toString(36).slice(2, 9)

  players.set(id, {
    socket,
    state: {
      id, 
      x: 400, 
      y: 300, 
      rotation: 0 ,
      hp: PLAYER_BASE_HP,
      maxHp: PLAYER_BASE_HP,
      drillParams: (0 & 0x7), // TODO: set properly
    },
    input: { dx: 0, dy: 0, rotation: 0 },
  })
  // S->C: Tell this client their assigned ID
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
  for (const player of players.values()) {
    const chunkIndex = getChunkIndex(player.state.x, player.state.y)
    const nearbySquareIds = getNearbySquareIds(chunkIndex) // only consider 9 nearest chunks for efficient collision checking

    for (const id of nearbySquareIds) {
      const square = squares.get(id)
      if (!square) continue
      const dx = player.state.x - square.state.x
      const dy = player.state.y - square.state.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const radiusSum = PLAYER_RADIUS + square.radius

      if (dist < radiusSum) {
        const overlap = radiusSum - dist
        const nx = dx / dist
        const ny = dy / dist

        // positional correction — push player out of square
        player.state.x += nx * overlap
        player.state.y += ny * overlap

        // deal damage
        player.state.hp -= square.state.maxHp * SQUARE_COLLISION_DAMAGE_FACTOR
        square.state.hp -= player.state.maxHp * PLAYER_COLLISION_DAMAGE_FACTOR
      }
    }
  }

  // 3) Spawn bots
  if (tick % 60 === 0) {  // every 3s (60 ticks * 50ms)
    spawnBots()
  }

  // 4) TODO: Process bot input

  // 5) Process each active square
  const toDelete: string[] = []
  
  for (const square of squares.values()) {
    if (
      square.state.x < -WORLD_PADDING || square.state.x > WORLD_WIDTH + WORLD_PADDING ||
      square.state.y < -WORLD_PADDING || square.state.y > WORLD_HEIGHT + WORLD_PADDING ||
      square.state.hp <= 0
    ) {
      toDelete.push(square.state.id)
    } else {
      square.angle += (Math.random() - 0.5) * 0.2
      square.state.x += Math.cos(square.angle) * SQUARE_SPEED
      square.state.y += Math.sin(square.angle) * SQUARE_SPEED
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
  if (tick % 10 === 0) {  // every 500ms (10 ticks * 50ms)
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
        // TODO: check overlap with existing squares before placing (collision branch)
        const id = Math.random().toString(36).slice(2, 9)
        squares.set(id, {
          state: {
            id: id,
            x: col * chunkW + Math.random() * chunkW,
            y: row * chunkH + Math.random() * chunkH,
            hp: SQUARE_BASE_HP * DANGER_MAP[row * CHUNK_COLS + col],
            maxHp: SQUARE_BASE_HP * DANGER_MAP[row * CHUNK_COLS + col],
          },
          angle: Math.random() * Math.PI * 2,
          radius: SQUARE_BASE_RADIUS * DANGER_MAP[row * CHUNK_COLS + col],
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
      const existing = chunkToSquares.get(row * CHUNK_COLS + col)!.size
      const toSpawn = Math.max(0, DENSITY_MAP[row * CHUNK_COLS + col] - existing)
      for (let i = 0; i < toSpawn; i++) {
        const id = Math.random().toString(36).slice(2, 9)
        squares.set(id, {
          state: {
            id: id,
            x: col * chunkW + Math.random() * chunkW,
            y: row * chunkH + Math.random() * chunkH,
            hp: SQUARE_BASE_HP * DANGER_MAP[row * CHUNK_COLS + col],
            maxHp: SQUARE_BASE_HP * DANGER_MAP[row * CHUNK_COLS + col],
          },
          angle: Math.random() * Math.PI * 2,
          radius: SQUARE_BASE_RADIUS * DANGER_MAP[row * CHUNK_COLS + col],
        })

        // if spawning on a player, cancel spawn
        // TODO
      }
    }
  }
}

function getChunkIndex(x: number, y: number): number {
  const col = Math.floor(x / (WORLD_WIDTH / CHUNK_COLS))
  const row = Math.floor(y / (WORLD_HEIGHT / CHUNK_ROWS))
  return row * CHUNK_COLS + col
}

function getNearbySquareIds(chunkIndex: number): string[] {
  const col = chunkIndex % CHUNK_COLS
  const row = Math.floor(chunkIndex / CHUNK_COLS)
  const ids: string[] = []
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