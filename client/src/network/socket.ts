import { ServerMessage } from '../../../protocol/messages'

let current: WebSocket = null!
const listeners: ((event: MessageEvent) => void)[] = []
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
    for (const listener of listeners) listener(e)
  }
}

export function getLocalId() { return localId }
export function addSocketListener(fn: (event: MessageEvent) => void) {
  listeners.push(fn)
}
export function removeSocketListener(fn: (event: MessageEvent) => void) {
  listeners.splice(listeners.indexOf(fn), 1)
}

const socket = {
  send: (data: string) => current.send(data),
  get readyState() { return current.readyState }
}

connect()
export default socket