export type GameEvent =
  | PlayerKilledEvent
  | SquareKilledEvent
  | BotSpawnedEvent

export interface PlayerKilledEvent {
  kind: 'player_killed'
  killerId: number
  victimId: number
  victimName: string
  killerName: string
  gemsAwarded: number
  cause: 'player' | 'drill' | 'square'
}

export interface SquareKilledEvent {
  kind: 'square_killed'
  killerId: number
}

export interface BotSpawnedEvent {
  kind: 'bot_spawned'
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