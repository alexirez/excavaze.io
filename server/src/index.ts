import { WebSocketServer, WebSocket } from 'ws'
import { ServerPlayer } from './entities'
import { ClientMessage, WorldStateMessage } from '../../protocol/messages'

const PORT = 3000
const TICK_MS = 50 // 20 tick/sec
const SPEED = 10    // pixels per tick

const wss = new WebSocketServer({ port: PORT })
console.log(`Server running on ws://localhost:${PORT}`)

const players = new Map<string, ServerPlayer>()

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
    player.state.x += player.input.dx * SPEED
    player.state.y += player.input.dy * SPEED
    player.state.rotation = player.input.rotation
  }

  // Serialize world state once, send to every connected client
  const message: WorldStateMessage = {
    type: 'world_state',
    players: Array.from(players.values()).map(p => p.state),
  }

  const json = JSON.stringify(message)

  for (const player of players.values()) {
    if (player.socket.readyState === WebSocket.OPEN) {
      player.socket.send(json)
    }
  }
}, TICK_MS)