import { ClientPlayer } from '../client/src/entities'
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
  upgrades: string[]
  cameraX: number
  cameraY: number
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

// C->S: client wants to respawn
export interface ClientRespawnMessage {
  type: 'client_respawn'
  name: string
  upgrades: string[]
  bodyColor: number
  borderColor: number
}

// S->C: a player has spawned or respawned
export interface ServerRespawnMessage {
  type: 'player_respawn'
  id: number
  name: string
  bodyColor: number
  borderColor: number
  xpMultiplier: number
  maxLevel: number
  maxHp: number
  hpRegenPerSec: number
  moveSpeedMultiplier: number
  radius: number
  collectedPerks: string[]
  drillType: number
  drillDmgMultiplier: number
  drillLengthMultiplier: number
}

// S->C: tell clients to update their rendering
export interface PlayerUpdateMessage {
  type: 'player_update'
  id: number
  changes: Partial<Omit<ClientPlayer, 'snapshot'>>
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

export type ClientMessage = InputMessage | ClientRespawnMessage | PerkSelection | TryPurchaseUpgrade | RequestPerkChoices
export type ServerMessage = WelcomeMessage | WorldStateMessage | ServerRespawnMessage | PlayerUpdateMessage | PlayerKilledMessage 
  | SquareKilledPlayerMessage | DeathScreenMessage | PerkOptions
