
export interface PlayerState {
  id: number
  xp: number
  alive: boolean
  shieldActive: boolean
  x: number
  y: number
  rotation: number
  hp: number
}

export interface SquareState {
  id: number
  x: number
  y: number
  hp: number
  maxHp: number
  rotation: number
}