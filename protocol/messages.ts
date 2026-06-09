import { PlayerState, SquareState } from './types'

// C->S: Client tells server what inputs are being held this tick
export interface InputMessage {
  type: 'input'
  dx: number       // -1 (left), 0 (none), or 1 (right)
  dy: number       // -1 (up), 0 (none), or 1 (down)
  rotation: number // aim angle in radians
}

// S->C: Server tells all clients where every object is this tick
export interface WorldStateMessage {
  type: 'world_state'
  players: PlayerState[],
  squares: SquareState[]
}

// S->C: Server tells the client what their assigned ID is upon connecting
export interface WelcomeMessage {
  type: 'welcome'
  id: number
}

export interface LevelUpMessage {
  type: 'level_up'
  options: UpgradeOption[]
}

export interface UpgradeOption {
  id: string  // 'drill_damage', 'drill_length', 'player_radius', etc
  label: string
  description: string
}

export interface RequestUpgradeMessage {
  type: 'request_upgrade'
  optionId: string
}

export interface PlayerKilledMessage {
  type: 'player_killed'
  killerId: number
  victimId: number
}

export type ClientMessage = InputMessage | RequestUpgradeMessage
export type ServerMessage = WelcomeMessage | WorldStateMessage | LevelUpMessage | PlayerKilledMessage
