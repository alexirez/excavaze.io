const socket = new WebSocket('ws://localhost:3000')

socket.onopen = () => {
  console.log('Connected to server')
}

socket.onclose = () => {
  console.log('Disconnected from server')
}

export default socket