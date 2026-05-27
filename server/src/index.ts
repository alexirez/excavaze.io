import { WebSocketServer } from 'ws'
import { WebSocket } from 'ws'
import { ServerPlayer } from './entities'
import { PlayerState } from '../../protocol/types'
import { ClientMessage, WorldStateMessage } from '../../protocol/messages'

const PORT = 3000
const TICK_MS = 50 // 20 tick/sec
const SPEED = 3    // pixels per tick

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