import { WebSocketServer } from 'ws'

const PORT = 3000
const wss = new WebSocketServer({ port: PORT })

console.log(`Server running on ws://localhost:${PORT}`)

wss.on('connection', (socket) => {
  console.log('Client connected')

  socket.on('close', () => {
    console.log('Client disconnected')
  })
})