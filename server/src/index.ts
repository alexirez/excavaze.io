import { WebSocketServer, WebSocket } from 'ws'
import { ServerPlayer, ServerSquare } from './entities'
import { ClientMessage, WorldStateMessage } from '../../protocol/messages'
import { SquareState } from '../../protocol/types'

const PORT = 3000
const TICK_MS = 50 // 20 tick/sec
const WORLD_WIDTH = 800
const WORLD_HEIGHT = 600
const CHUNK_COLS = 16
const CHUNK_ROWS = 16
const SQUARES_DENSITY = 2
const UNIT_SPEED = 10  // pixels per tick
const SQUARE_SPEED = 2  // multiplies speed of drifting

const wss = new WebSocketServer({ port: PORT })
console.log(`Server running on ws://localhost:${PORT}`)

const players = new Map<string, ServerPlayer>()
const squares = new Map<string, ServerSquare>()

spawnSquares() // for now, just spawn on game start. later, constantly re-evaluate chunk densities

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

function spawnSquares() {
  const chunkW = WORLD_WIDTH / CHUNK_COLS
  const chunkH = WORLD_HEIGHT / CHUNK_ROWS
  for (let i = 0; i < CHUNK_ROWS; i++) {
    for (let col = 0; col < CHUNK_COLS; col++) {
      const existing = 0 // TODO: use collision/distance functions (will add later) to count squares in this chunk
      const toSpawn = Math.max(0, SQUARES_DENSITY - existing)

      for (let row = 0; row < CHUNK_ROWS; row++) {
        for (let i = 0; i < toSpawn; i++) {
          // TODO: check overlap with existing squares before placing (collision branch)
          const id = Math.random().toString(36).slice(2, 9)
          squares.set(id, {
            id,
            state: {
              x: col * chunkW + Math.random() * chunkW,
              y: row * chunkH + Math.random() * chunkH,
              angle: Math.random() * Math.PI * 2,
            }
          })
        }
      }
    }
  }
}