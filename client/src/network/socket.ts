let current: WebSocket = null!

function connect() {
  current = new WebSocket('ws://localhost:3000')
  current.onopen = () => console.log('Connected to server')
  current.onclose = () => {
    console.log('Disconnected, retrying in 0.5s...')
    setTimeout(connect, 500)
  }
  current.onmessage = (e) => socket.onmessage?.(e)
}

const socket = {
  send: (data: string) => current.send(data),
  onmessage: null as ((event: MessageEvent) => void) | null,
  get readyState() { return current.readyState }
}

connect()
export default socket