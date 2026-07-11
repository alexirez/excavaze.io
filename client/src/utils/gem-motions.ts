export const POOL_SIZE = 128

export type GemState = 'burst' | 'idle' | 'despawn'

export const BURST_TIME = 220
export const BURST_DISTANCE = 20
export const DESPAWN_TIME = 5000
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

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function transition(slot: GemSlot, next: GemState, now: number): void {
  slot.state = next
  slot.t0 = now
}

export const ANIMATION_STEP: Record<GemState, (slot: GemSlot, now: number) => void> = {
  burst(slot, now) {
    const elapsed = now - slot.t0
    const t = Math.min(1, elapsed / BURST_TIME)
    const dist = easeOutCubic(t) * BURST_DISTANCE
    slot.x = slot.originX + Math.cos(slot.angle) * dist
    slot.y = slot.originY + Math.sin(slot.angle) * dist
    if (elapsed >= BURST_TIME) transition(slot, 'idle', now)
  },
  idle(slot, now) {
    const elapsed = now - slot.t0
    if (elapsed >= DESPAWN_TIME) transition(slot, 'despawn', now)
  },
  despawn(slot, now) {
    const elapsed = now - slot.t0
    const t = Math.min(1, elapsed / FADE_TIME)
    slot.opacity = 1 - t
    if (t >= 1) slot.active = false
  },
}