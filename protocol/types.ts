// Represents a single player's current state in the world.
// Created and owned by the server, sent to all clients.
export interface PlayerState {
  id: number
  name: string
  xp: number
  alive: boolean
  shieldActive: boolean
  x: number
  y: number
  rotation: number
  hp: number
  maxHp: number,
  playerRadius: number
  drillType: number,
  drillDmgMultiplier: number,
  drillLengthMultiplier: number,
}

export interface SquareState {
  id: number
  x: number
  y: number
  hp: number
  maxHp: number
  rotation: number
}