import { WebSocketServer, WebSocket } from 'ws'
import { ServerPlayer, ServerSquare } from './entities'
import { ClientMessage, WorldStateMessage } from '../../protocol/messages'
import { WORLD_WIDTH, WORLD_HEIGHT } from '../../protocol/constants'

const PORT = 3000
const TICK_MS = 50 // 20 tick/sec
const CHUNK_COLS = 16
const CHUNK_ROWS = 16
const SQUARES_DENSITY = 2
const UNIT_SPEED = 10  // pixels per tick
const SQUARE_SPEED = 2  // multiplies speed of drifting

const wss = new WebSocketServer({ port: PORT })
console.log(`Server running on ws://localhost:${PORT}`)

const players = new Map<string, ServerPlayer>()
const squares = new Map<string, ServerSquare>()

spawnSquaresOnStartup()

wss.on('connection', (socket) => {
  const id = Math.random().toString(36).slice(2, 9)

  players.set(id, {
    socket,
    state: { id, x: 400, y: 300, rotation: 0 },
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
  // Apply each player's latest input to their position
  for (const player of players.values()) {
    player.state.x += player.input.dx * UNIT_SPEED
    player.state.y += player.input.dy * UNIT_SPEED
    player.state.rotation = player.input.rotation
  }

  // Move each active square
  for (const square of squares.values()) {
    square.state.angle += (Math.random() - 0.5) * 0.2
    square.state.x += Math.cos(square.state.angle) * SQUARE_SPEED
    square.state.y += Math.sin(square.state.angle) * SQUARE_SPEED
  }

  // Serialize world state once, send to every connected client
  const message: WorldStateMessage = {
    type: 'world_state',
    players: Array.from(players.values()).map(p => p.state),
    squares: Array.from(squares.values()).map(p => p.state)
  }

  const json = JSON.stringify(message)

  for (const player of players.values()) {
    if (player.socket.readyState === WebSocket.OPEN) {
      player.socket.send(json)
    }
  }
}, TICK_MS)

function spawnSquaresOnStartup() {
  const chunkW = WORLD_WIDTH / CHUNK_COLS
  const chunkH = WORLD_HEIGHT / CHUNK_ROWS

  for (let row = 0; row < CHUNK_ROWS; row++) {
    for (let col = 0; col < CHUNK_COLS; col++) {
      const existing = 0 // TODO: use collision/distance functions (will add later) to count squares in this chunk
      const toSpawn = Math.max(0, SQUARES_DENSITY - existing)
      for (let i = 0; i < toSpawn; i++) {
        // TODO: check overlap with existing squares before placing (collision branch)
        const id = Math.random().toString(36).slice(2, 9)
        squares.set(id, {
          state: {
            id: id,
            x: col * chunkW + Math.random() * chunkW,
            y: row * chunkH + Math.random() * chunkH,
            angle: Math.random() * Math.PI * 2,
          }
        })
      }
    }
  }
}

// Helper method to count squares per chunk, used in spawnSquares
function countSquaresPerChunk(): number[] {
  const chunkW = WORLD_WIDTH / CHUNK_COLS
  const chunkH = WORLD_HEIGHT / CHUNK_ROWS
  const counts = new Array(CHUNK_ROWS * CHUNK_COLS).fill(0)

  for (const square of squares.values()) {
    const col = Math.floor(square.state.x / chunkW)
    const row = Math.floor(square.state.y / chunkH)
    if (col >= 0 && col < CHUNK_COLS && row >= 0 && row < CHUNK_ROWS) {
      counts[row * CHUNK_COLS + col]++
    }
  }

  return counts
}