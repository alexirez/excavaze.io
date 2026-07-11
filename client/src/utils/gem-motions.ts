export const POOL_SIZE = 128

export interface GemSlot {
  active: boolean
  x: number
  y: number
  baseX: number
  baseY: number
  startTime: number
}

// Temporary test motion — oscillates left/right around baseX via a sine wave.
export function stepLerpTest(slot: GemSlot, now: number): void {
  const elapsed = now - slot.startTime
  const amplitude = 60
  const speed = 0.002
  slot.x = slot.baseX + Math.sin(elapsed * speed) * amplitude
  slot.y = slot.baseY
}