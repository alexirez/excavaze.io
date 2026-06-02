// Represents a single player's current state in the world.
// Created and owned by the server, sent to all clients.
export interface PlayerState {
  id: number
  x: number
  y: number
  rotation: number
  hp: number
  maxHp: number
  drillParams: number
}

export interface SquareState {
  id: number
  x: number
  y: number
  hp: number
  maxHp: number
}