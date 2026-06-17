import { WebSocket as NodeWebSocket } from 'ws'
import { PlayerState, SquareState } from '../../protocol/types'

export interface ServerPlayer {
  socket: NodeWebSocket | null
  state: PlayerState
  input: { dx: number; dy: number; rotation: number }
  shieldTicks: number
  lastCollisionTime: number
  wanderAngle: number
  moveSpeed: number
}

export interface ServerSquare {
  state: SquareState,
  pathAngle: number,
  boundingRadius: number,
  rotationSpeed: number,
}