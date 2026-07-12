import { useEffect, useRef } from 'react'
import { GemSlot, POOL_SIZE, createGemSlot, ANIMATION_STEP, getBurstAngle, BURST_SPEED_X, BURST_SPEED_Y, BURST_MAX_DELAY_TIME } from '../utils/gem-motions'
import { clientPlayers, cameraScroll } from '../clientState'
import { resolve } from 'node:dns'

export let gemsOverlayHandle: {
  burstGems: (originX: number, originY: number, 
    target: { id: number } | { x: number, y: number }, 
    count: number) => void } | null = null

export default function GemsOverlay() {
  const poolRef = useRef<GemSlot[]>(Array.from({ length: POOL_SIZE }, createGemSlot))
  const nodeRefs = useRef<(HTMLImageElement | null)[]>(Array(POOL_SIZE).fill(null))
  const cursorRef = useRef(0)
  const lastFrameTimeRef = useRef(0)

  function acquireSlot(): number {
    const pool = poolRef.current
    for (let i = 0; i < pool.length; i++) {
      const idx = (cursorRef.current + i) % pool.length
      if (!pool[idx].active) {
        cursorRef.current = (idx + 1) % pool.length
        return idx
      }
    }
    const idx = cursorRef.current
    cursorRef.current = (idx + 1) % pool.length
    return idx
  }

  function resolveTargetScreenPos(targetId: number | null): { x: number, y: number } | null {
    if (targetId === null) return null
    const cp = clientPlayers.get(targetId)
    if (!cp || !cp.snapshot.alive) return null
    return { x: cp.snapshot.x - cameraScroll.x, y: cp.snapshot.y - cameraScroll.y }
  }

  function burstGems(
    originX: number, originY: number,
    target: { id: number } | { x: number, y: number },
    count: number
  ): void {
    const pool = poolRef.current
    const nodes = nodeRefs.current
    const now = performance.now()
    const targetId = 'id' in target ? target.id : null
    const initial = 'id' in target ? resolveTargetScreenPos(target.id) : target

    for (let i = 0; i < count; i++) {
      const idx = acquireSlot()
      const slot = pool[idx]
      const angle = getBurstAngle(i, count)
      slot.active = true
      slot.state = 'pendingSpawn'
      slot.t0 = now
      slot.timer = Math.random() * BURST_MAX_DELAY_TIME
      slot.originX = originX
      slot.originY = originY
      slot.x = originX
      slot.y = originY
      slot.vx = Math.cos(angle) * BURST_SPEED_X
      slot.vy = Math.sin(angle) * BURST_SPEED_Y
      slot.targetId = targetId
      slot.targetX = initial?.x ?? originX
      slot.targetY = initial?.y ?? originY
      slot.opacity = 0
      const node = nodes[idx]
      if (node) node.style.display = 'block'
    }
  }

  useEffect(() => {
    gemsOverlayHandle = { burstGems }
    return () => { gemsOverlayHandle = null }
  }, [])

  useEffect(() => {
    // --- temporary test trigger: burst towards the start-menu gems display ---
  const anchor = document.getElementById('gems-display-anchor')
  if (anchor) {
    const rect = anchor.getBoundingClientRect()
    const targetX = rect.left + rect.width / 2
    const targetY = rect.top + rect.height / 2
    burstGems(window.innerWidth / 2 * 0.1, window.innerHeight / 2, { x: targetX, y: targetY}, 8)
  }
  // --- end temporary test trigger ---

    lastFrameTimeRef.current = performance.now()
    let frameId: number
    const loop = () => {
      const now = performance.now()
      const dt = Math.min(now - lastFrameTimeRef.current, 50)
      lastFrameTimeRef.current = now

      const pool = poolRef.current
      const nodes = nodeRefs.current
      for (let i = 0; i < pool.length; i++) {
        const gem = pool[i]
        if (!gem.active) continue
        const node = nodes[i]
        if (!node) continue

        if (gem.state === 'homing' && gem.targetId !== null) {
          const resolved = resolveTargetScreenPos(gem.targetId)
          if (resolved) {
            gem.targetX = resolved.x
            gem.targetY = resolved.y
          }
        }

        ANIMATION_STEP[gem.state](gem, now, dt)

        if (!gem.active) {
          node.style.display = 'none'
          continue
        }
        node.style.transform = `translate3d(${gem.x}px, ${gem.y}px, 0)`
        node.style.opacity = String(gem.opacity)
      }
      frameId = requestAnimationFrame(loop)
    }
    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 60 }}>
      {Array.from({ length: POOL_SIZE }).map((_, i) => (
        <img
          key={i}
          ref={el => { nodeRefs.current[i] = el }}
          src="/assets/gem.svg"
          alt=""
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 24,
            height: 24,
            display: 'none',
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  )
}