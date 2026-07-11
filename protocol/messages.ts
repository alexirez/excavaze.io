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

// S-C: tell client a player killed them
export interface PlayerKilledMessage {
  type: 'player_killed'
  killerId: number
  victimId: number
  victimName: string
  killerName: string
}

// S-C: tell client a square killed them
export interface SquareKilledPlayerMessage {
  type: 'square_killed_player'
  victimId: number
  victimName: string
}

// S->C: tell client they died
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

// C->S: triggers a response with PerkOptions
export interface RequestPerkChoices {
  type: 'request_perk_choices'
}

// S->C: list of perk ids the GUI can unpack and display
export interface PerkOptions {
  type: 'perk_options'
  perkOptions: string[]
}

// C->S: Client's choice of which perk to choose, followed by server-side validation
export interface PerkSelection {
  type: 'select_perk'
  perkId: string
}

// C->S: Client asks server to buy the upgrade for the player
export interface TryPurchaseUpgrade {
  type: 'try_purchase_upgrade'
  nodeId: string
}

// S->C: result of a TryPurchaseUpgrade request
export interface PurchaseResultMessage {
  type: 'purchase_result'
  success: boolean
  nodeId: string
  gems: number
  purchasedUpgrades: string[]
}

// C->S: send token to request login, or null if not found/new user
export interface GuestLoginMessage {
  type: 'guest_login'
  token: string | null
}

// C->S: login via Google, once you add it
export interface GoogleLoginMessage {
  type: 'google_login'
  idToken: string
} // TODO: google login option

// S->C: server tells client their new token
export interface AssignGuestToken {
  type: 'assign_guest_token'
  token: string
}

// S->C: sent after guest_login, the player's current active + queued quests
export interface PlayerQuestsMessage {
  type: 'player_quests'
  quests: { instanceId: string, questId: string, status: 'active' | 'queued', progress: number }[]
}

// S->C: a quest just crossed its target and can be claimed (progress-based quests only;
// instant quests skip this and go straight to player_quests/quest_claimed)
export interface QuestCompletedMessage {
  type: 'quest_completed'
  instanceId: string
}

// C->S: player wants to claim a ready quest
export interface ClaimQuestMessage {
  type: 'claim_quest'
  instanceId: string
}

// S->C: result of a claim_quest request, or a server-initiated instant completion
export interface QuestClaimedMessage {
  type: 'quest_claimed'
  success: boolean
  instanceId: string
  gems?: number
  promotedQuestId?: string
  promotedInstanceId?: string
}

export interface QuestProgressMessage {
  type: 'quest_progress'
  instanceId: string
  progress: number
}

export type ClientMessage = InputMessage | ClientRespawnMessage | PerkSelection
  | TryPurchaseUpgrade | RequestPerkChoices | GuestLoginMessage | GoogleLoginMessage
  | ClaimQuestMessage
  
export type ServerMessage = WelcomeMessage | WorldStateMessage | ServerRespawnMessage
  | PlayerUpdateMessage | PlayerKilledMessage | SquareKilledPlayerMessage 
  | DeathScreenMessage | PerkOptions | PurchaseResultMessage | AssignGuestToken
  | PlayerQuestsMessage | QuestCompletedMessage | QuestClaimedMessage | QuestProgressMessage