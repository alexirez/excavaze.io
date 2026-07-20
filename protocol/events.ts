export type GameEvent =
  | PlayerKilledEvent
  | QuestProgressEvent

export interface PlayerKilledEvent {
  kind: 'player_killed'
  killerId: number
  victimId: number
  victimName: string
  killerName: string
  gemsAwarded: number
  cause: 'player' | 'drill' | 'square'
}

export interface QuestProgressEvent {
  kind: 'quest_progress'
  playerId: number
  instanceId: string
  progress: number
  justCompleted: boolean
}