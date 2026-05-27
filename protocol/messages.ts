import { PlayerState } from './types'

// C->S: Client tells server what inputs are being held this tick
export interface InputMessage {
  type: 'input'
  dx: number       // -1 (left), 0 (none), or 1 (right)
  dy: number       // -1 (up), 0 (none), or 1 (down)
  rotation: number // aim angle in radians
}

// S->C: Server tells all clients where every player is this tick
export interface WorldStateMessage {
  type: 'world_state'
  players: PlayerState[]
}

// S->C: Server tells the client what their assigned ID is upon connecting
export interface WelcomeMessage {
  type: 'welcome'
  id: string
}

export type ClientMessage = InputMessage
export type ServerMessage = WelcomeMessage | WorldStateMessage
