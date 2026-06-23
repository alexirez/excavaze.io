import { ServerMessage } from '../../../protocol/messages'

export const ONLINE_SERVER_URL = 'wss://excavaze.io'
export const LOCAL_SERVER_URL = 'ws://localhost:3000'

let current: WebSocket | null = null
let shouldReconnect = false
const listeners: ((event: MessageEvent) => void)[] = []
let localId: number | null = null
let reconnectGeneration = 0
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
let welcomeCallback: ((id: number, gems: number) => void) | null = null

function connect(url: string): void {
  const generation = ++reconnectGeneration
  shouldReconnect = true
  const ws = new WebSocket(url)
  current = ws

  ws.onopen = () => console.log('[socket] connected to', url)

  ws.onclose = () => {
    if (!shouldReconnect || current !== ws) return
    if (generation !== reconnectGeneration) return
    console.log(`[socket] connection to ${url} failed, retrying in 0.5s...`)
    reconnectTimeout = setTimeout(() => connect(url), 500)
  }

  ws.onmessage = (e) => {
  const msg = JSON.parse(e.data) as ServerMessage
  if (msg.type === 'welcome') {
    localId = msg.id
    welcomeCallback?.(msg.id, msg.gems)
    welcomeCallback = null
  }
  for (const listener of listeners) listener(e)
}
}

function disconnect(): Promise<void> {
  reconnectGeneration++
  shouldReconnect = false
  localId = null
  const ws = current
  current = null

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }

  if (!ws || ws.readyState === WebSocket.CLOSED) return Promise.resolve()
  return new Promise((resolve) => {
    ws.onclose = () => resolve()
    ws.close(1000, 'Mode switch')
  })
}

export function getLocalId(): number | null {
  return localId
}

// Returns unsubscribe function so callers can clean up easily
export function addSocketListener(fn: (event: MessageEvent) => void): () => void {
  listeners.push(fn)
  return () => {
    const i = listeners.indexOf(fn)
    if (i !== -1) listeners.splice(i, 1)
  }
}

export const socket = {
  send(data: string): void {
    if (current?.readyState === WebSocket.OPEN) current.send(data)
    else console.warn('[socket] send called but socket is not open')
  },

  isOpen(): boolean {
    return current?.readyState === WebSocket.OPEN
  },

  onceOpen(callback: () => void): void {
    if (this.isOpen()) { callback(); return }
    const ws = current
    const handler = () => {
      callback()
      ws?.removeEventListener('open', handler)
    }
    ws?.addEventListener('open', handler)
  },

  onWelcome(cb: (id: number, gems: number) => void): void {
    welcomeCallback = cb
  },

  get readyState() { return current?.readyState ?? WebSocket.CLOSED },
  connect,
  disconnect,
}

window.addEventListener('pagehide', () => {
  shouldReconnect = false
  current?.close()
})