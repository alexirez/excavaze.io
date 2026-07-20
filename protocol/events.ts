export type GameEvent =
  | PlayerKilledEvent
  | SquareKilledEvent

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