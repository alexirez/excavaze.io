import { useEffect, useRef } from 'react'
import { GemSlot, POOL_SIZE, createGemSlot, ANIMATION_STEP } from '../utils/gem-motions'

export let gemsOverlayHandle: { burstGems: (originX: number, originY: number, count: number) => void } | null = null

export default function GemsOverlay() {
  const poolRef = useRef<GemSlot[]>(Array.from({ length: POOL_SIZE }, createGemSlot))
  const nodeRefs = useRef<(HTMLImageElement | null)[]>(Array(POOL_SIZE).fill(null))
  const cursorRef = useRef(0)

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

  function burstGems(originX: number, originY: number, count: number): void {
    const pool = poolRef.current
    const nodes = nodeRefs.current
    const now = performance.now()
    for (let i = 0; i < count; i++) {
      const idx = acquireSlot()
      const slot = pool[idx]
      slot.active = true
      slot.state = 'burst'
      slot.t0 = now
      slot.originX = originX
      slot.originY = originY
      slot.angle = Math.random() * Math.PI * 2
      slot.x = originX
      slot.y = originY
      slot.opacity = 1
      const node = nodes[idx]
      if (node) node.style.display = 'block'
    }
  }

  useEffect(() => {
    gemsOverlayHandle = { burstGems }
    return () => { gemsOverlayHandle = null }
  }, [])

  useEffect(() => {
    // --- temporary test trigger ---
    burstGems(window.innerWidth / 2, window.innerHeight / 2, 20)
    // --- end temporary test trigger ---

    let frameId: number
    const loop = () => {
      const now = performance.now()
      const pool = poolRef.current
      const nodes = nodeRefs.current
      for (let i = 0; i < pool.length; i++) {
        const gem = pool[i]
        if (!gem.active) continue
        const node = nodes[i]
        if (!node) continue

        ANIMATION_STEP[gem.state](gem, now)

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