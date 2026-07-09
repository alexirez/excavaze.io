import { PlayerState } from '../../protocol/types'

export interface ClientPlayer {
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
  snapshot: PlayerState
}

export interface DisplayQuest {
  instanceId: string
  questId: string
  status: 'active' | 'queued' | 'completed'
  progress: number
}