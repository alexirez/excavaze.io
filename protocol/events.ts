export type GameEvent =
  | PlayerKilledEvent
  | PlayerKilledBySquareEvent
  | QuestProgressEvent

export interface PlayerKilledEvent {
  kind: 'player_killed'
  killerId: number
  victimId: number
  victimName: string
  killerName: string
  gemsAwarded: number
  cause: 'player' | 'drill'
}

export interface PlayerKilledBySquareEvent {
  kind: 'player_killed_by_square'
  victimId: number
  victimName: string
}

export interface QuestProgressEvent {
  kind: 'quest_progress'
  playerId: number
  instanceId: string
  progress: number
  justCompleted: boolean
}