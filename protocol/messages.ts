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
  gems: number
  greenCores: number
  purpleCores: number
  yellowCores: number
  upgrades: string[]
}

export interface PlayerKilledMessage {
  type: 'player_killed'
  killerId: number
  victimId: number
  victimName: string
  killerName: string
}

export interface SquareKilledPlayerMessage {
  type: 'square_killed_player'
  victimId: number
  victimName: string
}

export interface DeathScreenMessage {
  type: 'death_screen'
  killerName: string
  cause: 'player' | 'drill' | 'square'
}

export interface RespawnMessage {
  type: 'respawn'
  name: string
  upgrades: string[]
}

export interface RequestPerkChoices {
  type: 'request_perk_choices'
}

export interface PerkOptions {
  type: 'perk_options'
  perkOptions: string[]
}

export interface PerkSelection {
  type: 'select_perk'
  perkId: string
}

export interface TryPurchaseUpgrade {
  type: 'try_purchase_upgrade'
  nodeId: string
}

export type ClientMessage = InputMessage | RespawnMessage | PerkSelection | TryPurchaseUpgrade | RequestPerkChoices
export type ServerMessage = WelcomeMessage | WorldStateMessage | PlayerKilledMessage 
  | SquareKilledPlayerMessage | DeathScreenMessage | PerkOptions
