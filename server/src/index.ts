import { WebSocketServer } from 'ws'
import { PlayerState } from '../../protocol/types'
import { ClientMessage, WorldStateMessage } from '../../protocol/messages'

const PORT = 3000
const TICK_MS = 50 // 20 tick/sec
const SPEED = 3    // pixels per tick

const wss = new WebSocketServer({ port: PORT })
console.log(`Server running on ws://localhost:${PORT}`)

wss.on('connection', (socket) => {
  console.log('Client connected')

  socket.on('close', () => {
    console.log('Client disconnected')
  })
})