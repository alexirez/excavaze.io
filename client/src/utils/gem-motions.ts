export const POOL_SIZE = 128

export type GemState = 'burst' | 'idle' | 'despawn'

export const BURST_TIME = 800
export const BURST_SPEED_X = 0.25   // px/ms, initial launch speed
export const BURST_SPEED_Y = 0.35
const BURST_ANGLE_SPREAD_DEG = 160
export const BURST_ANGLE_START = ((-90 - BURST_ANGLE_SPREAD_DEG / 2) * Math.PI) / 180
export const BURST_ANGLE_END = ((-90 + BURST_ANGLE_SPREAD_DEG / 2) * Math.PI) / 180
export const GRAVITY = 0.001     // px/ms^2, downward pull during burst
export const DESPAWN_TIME = 2000
export const FADE_TIME = 500

export interface GemSlot {
  active: boolean
  state: GemState
  t0: number
  originX: number
  originY: number
  angle: number
  x: number
  y: number
  opacity: number
}

export function createGemSlot(): GemSlot {
  return {
    active: false,
    state: 'idle',
    t0: 0,
    originX: 0,
    originY: 0,
    angle: 0,
    x: 0,
    y: 0,
    opacity: 1,
  }
}

function setState(slot: GemSlot, next: GemState, now: number): void {
  slot.state = next
  slot.t0 = now
}

export const ANIMATION_STEP: Record<GemState, (slot: GemSlot, now: number) => void> = {
  burst(slot, now) {
    const elapsed = Math.min(now - slot.t0, BURST_TIME)
    const vx0 = Math.cos(slot.angle) * BURST_SPEED_X
    const vy0 = Math.sin(slot.angle) * BURST_SPEED_Y
    slot.x = slot.originX + vx0 * elapsed
    slot.y = slot.originY + vy0 * elapsed + 0.5 * GRAVITY * elapsed * elapsed
    if (now - slot.t0 >= BURST_TIME) setState(slot, 'idle', now)
  },
  idle(slot, now) {
    if (now - slot.t0 >= DESPAWN_TIME) setState(slot, 'despawn', now)
  },
  despawn(slot, now) {
    const t = Math.min(1, (now - slot.t0) / FADE_TIME)
    slot.opacity = 1 - t
    if (t >= 1) slot.active = false
  },
}

export function getBurstAngle(index: number, count: number): number {
  const range = BURST_ANGLE_END - BURST_ANGLE_START
  const sliceSize = range / count
  const sliceStart = BURST_ANGLE_START + index * sliceSize
  return sliceStart + Math.random() * sliceSize
}