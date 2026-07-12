export const POOL_SIZE = 128

export type GemState = 'pendingSpawn' | 'burst' | 'homing' | 'despawn'

export const BURST_TIME = 800
export const BURST_MAX_DELAY_TIME = 250
export const BURST_SPEED_X = 0.25   // px/ms, initial launch speed
export const BURST_SPEED_Y = 0.35
const BURST_ANGLE_SPREAD_DEG = 160
export const BURST_ANGLE_START = ((-90 - BURST_ANGLE_SPREAD_DEG / 2) * Math.PI) / 180
export const BURST_ANGLE_END = ((-90 + BURST_ANGLE_SPREAD_DEG / 2) * Math.PI) / 180
export const GRAVITY = 0.001               // px/ms^2, downward pull during burst

export const TO_TARGET_ACCELERATION = 0.003 // px/ms^2, applied equally to x and y toward target
export const HOMING_DRAG = 0.003
export const CLOSING_DISTANCE = 20           // px, gem despawns once within this of its target
const HOMING_DESPAWN_TIME = 5000

export const FADE_TIME = 50

export interface GemSlot {
  active: boolean
  state: GemState
  t0: number
  originX: number
  originY: number
  x: number
  y: number
  vx: number
  vy: number
  targetId: number | null
  targetX: number
  targetY: number
  opacity: number
  timer: number          // meaning depends on state: pendingSpawn delay, homing despawn
}

export function createGemSlot(): GemSlot {
  return {
    active: false,
    state: 'despawn',
    t0: 0,
    originX: 0,
    originY: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    targetId: null,
    targetX: 0,
    targetY: 0,
    opacity: 1,
    timer: 0,
  }
}

export function getBurstAngle(index: number, count: number): number {
  const range = BURST_ANGLE_END - BURST_ANGLE_START
  const sliceSize = range / count
  const sliceStart = BURST_ANGLE_START + index * sliceSize
  return sliceStart + Math.random() * sliceSize
}

function setState(slot: GemSlot, next: GemState, now: number): void {
  slot.state = next
  slot.t0 = now
}

export const ANIMATION_STEP: Record<GemState, (slot: GemSlot, now: number, dt: number) => void> = {
  pendingSpawn(slot, now) {
    if (now - slot.t0 >= slot.timer) {
      setState(slot, 'burst', now)
      slot.opacity = 1
    }
  },
  burst(slot, now, dt) {
    slot.vy += GRAVITY * dt
    slot.x += slot.vx * dt
    slot.y += slot.vy * dt
    if (now - slot.t0 >= BURST_TIME) {
      setState(slot, 'homing', now)
      slot.timer = HOMING_DESPAWN_TIME
    }
  },
  homing(slot, now, dt) {
    const drag = Math.max(0, 1 - HOMING_DRAG * dt)
    slot.vx *= drag
    slot.vy *= drag
    const dx = slot.targetX - slot.x
    const dy = slot.targetY - slot.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist <= CLOSING_DISTANCE || now - slot.t0 >= slot.timer) {
      setState(slot, 'despawn', now)
      return
    }
    slot.vx += (dx / dist) * TO_TARGET_ACCELERATION * dt
    slot.vy += (dy / dist) * TO_TARGET_ACCELERATION * dt
    slot.x += slot.vx * dt
    slot.y += slot.vy * dt
  },
  despawn(slot, now) {
    const t = Math.min(1, (now - slot.t0) / FADE_TIME)
    slot.opacity = 1 - t
    if (t >= 1) slot.active = false
  },
}