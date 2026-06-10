import { ServerMessage } from '../../../protocol/messages'

let current: WebSocket = null!
let localId: number | null = null

function connect() {
  current = new WebSocket('ws://localhost:3000')
  current.onopen = () => console.log('Connected to server')
  current.onclose = () => {
    console.log('Disconnected, retrying in 0.5s...')
    setTimeout(connect, 500)
  }
  current.onmessage = (e) => {
    const msg = JSON.parse(e.data) as ServerMessage
    if (msg.type === 'welcome') localId = msg.id
    socket.onmessage?.(e)
  }
}

export function getLocalId() { return localId }

const socket = {
  send: (data: string) => current.send(data),
  onmessage: null as ((event: MessageEvent) => void) | null,
  get readyState() { return current.readyState }
}

connect()
export default socket