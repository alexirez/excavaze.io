// Represents a single player's current state in the world.
// Created and owned by the server, sent to all clients.
export interface PlayerState {
  id: string
  x: number
  y: number
  rotation: number
}

export interface SquareState {
  id: string
  x: number
  y: number
  angle: number
}