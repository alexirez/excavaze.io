import { WebSocket as NodeWebSocket } from 'ws'
import { PlayerState } from '../../protocol/types'

export interface ServerPlayer {
  socket: NodeWebSocket
  state: PlayerState
  input: { dx: number; dy: number; rotation: number }
}

export interface ServerSquare {
  id: string
  x: number
  y: number
  vx: number   // current drift velocity
  vy: number
  angle: number  // current wander angle (radians)
}