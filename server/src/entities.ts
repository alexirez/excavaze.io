import { PlayerState } from '../../protocol/types'

interface ServerPlayer {
  socket: WebSocket
  state: PlayerState
  input: { dx: number; dy: number; rotation: number }
}

const players = new Map<string, ServerPlayer>()