import { WebSocket as NodeWebSocket } from 'ws'
import { PlayerState, SquareState } from '../../protocol/types'

export interface ServerPlayer {
  socket: NodeWebSocket | null
  dbId?: string
  guestToken?: string
  state: PlayerState
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
  input: { dx: number; dy: number; rotation: number }
  shieldTicks: number
  lastCollisionTime: number
  wanderAngle: number
  gems: number
  activeQuests: { instanceId: string, questId: string, progress: number }[]
  purchasedUpgrades: string[]
  pendingPerkChoices: string[]
}

export interface ServerSquare {
  state: SquareState,
  pathAngle: number,
  boundingRadius: number,
  rotationSpeed: number,
}