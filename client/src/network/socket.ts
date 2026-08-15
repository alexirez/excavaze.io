import { ServerMessage } from '../../../protocol/messages'
import { saveGuestToken } from '../offlineStorage'
import { localSocket, addSocketListener as addLocalListener, getOfflineId, onWelcome as onWelcomeLocal } from '../client-simulation'

export const ONLINE_SERVER_URL = 'wss://excavaze-io.onrender.com'

let current: WebSocket | null = null
let shouldReconnect = false
const listeners: ((event: MessageEvent) => void)[] = []
let onlineLocalId: number | null = null
const onlineMessageBuffer: ServerMessage[] = []
let reconnectGeneration = 0
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
let welcomeCallback: ((id: number, gems: number, upgrades: string[]) => void) | null = null
let lastWelcome: { id: number, gems: number, upgrades: string[] } | null = null

let mode: 'online' | 'offline' = 'online'
export function setMode(online: boolean): void {
  mode = online ? 'online' : 'offline'
}

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
      onlineLocalId = msg.id
      lastWelcome = { id: msg.id, gems: msg.gems, upgrades: msg.upgrades ?? [] }
      welcomeCallback?.(msg.id, msg.gems, msg.upgrades ?? [])
      welcomeCallback = null
    } else if (msg.type === 'assign_guest_token') {
      saveGuestToken(msg.token).catch(() => {})
    }
    if (msg.type !== 'world_state') onlineMessageBuffer.push(msg)
    for (const listener of listeners) listener(e)
  }
}

function disconnect(): Promise<void> {
  console.log('[socket] disconnected')
  reconnectGeneration++
  shouldReconnect = false
  onlineLocalId = null
  onlineMessageBuffer.length = 0
  lastWelcome = null
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
  return mode === 'online' ? onlineLocalId : getOfflineId()
}

export function addSocketListener(fn: (event: MessageEvent) => void): () => void { // Returns unsubscribe function so callers can clean up easily
  for (const msg of onlineMessageBuffer) fn({ data: JSON.stringify(msg) } as MessageEvent)
  listeners.push(fn)
  const unsubOnline = () => {
    const i = listeners.indexOf(fn)
    if (i !== -1) listeners.splice(i, 1)
  }
  const unsubOffline = addLocalListener(fn)
  return () => { unsubOnline(); unsubOffline() }
}

export const socket = {
  send(data: string): void {
    if (mode === 'online') {
      if (current?.readyState === WebSocket.OPEN) current.send(data); else console.warn('[socket] send called but socket is not open')
    } else {
      localSocket.send(data)
    }
  },

  isOpen(): boolean {
    return mode === 'online'
      ? current?.readyState === WebSocket.OPEN
      : localSocket.isOpen()
  },

  onceOpen(callback: () => void): void {
    if (mode === 'offline') { localSocket.onceOpen(callback); return }
    if (this.isOpen()) { callback(); return }
    const ws = current
    const handler = () => {
      callback()
      ws?.removeEventListener('open', handler)
    }
    ws?.addEventListener('open', handler)
  },

  onWelcome(cb: (id: number, gems: number, upgrades: string[]) => void): void {
    if (mode === 'online') {
      if (lastWelcome) { cb(lastWelcome.id, lastWelcome.gems, lastWelcome.upgrades); return }
      welcomeCallback = cb
    }
    else onWelcomeLocal(cb)
  },

  get readyState() {
    return mode === 'online'
      ? current?.readyState ?? WebSocket.CLOSED
      : localSocket.readyState
  },
  connect,
  disconnect,
}