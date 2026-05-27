import { WebSocket as NodeWebSocket } from 'ws'
import { PlayerState, SquareState } from '../../protocol/types'

export interface ServerPlayer {
  socket: NodeWebSocket
  state: PlayerState
  input: { dx: number; dy: number; rotation: number }
}

export interface ServerSquare {
  id: string
  state: SquareState
}