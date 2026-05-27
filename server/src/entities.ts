import { WebSocket as NodeWebSocket } from 'ws'
import { PlayerState } from '../../protocol/types'

export interface ServerPlayer {
  socket: NodeWebSocket
  state: PlayerState
  input: { dx: number; dy: number; rotation: number }
}