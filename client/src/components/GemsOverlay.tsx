import { useEffect, useRef } from 'react'
import { GemSlot, POOL_SIZE, stepLerpTest } from '../utils/gem-motions'

function createPool(): GemSlot[] {
  return Array.from({ length: POOL_SIZE }, () => ({
    active: false,
    x: 0,
    y: 0,
    baseX: 0,
    baseY: 0,
    startTime: 0,
  }))
}

export default function GemsOverlay() {
  const poolRef = useRef<GemSlot[]>(createPool())
  const nodeRefs = useRef<(HTMLImageElement | null)[]>(Array(POOL_SIZE).fill(null))

  useEffect(() => {
    // --- temporary test spawn: activate slot 0 in the center of the screen ---
    const slot = poolRef.current[0]
    const node = nodeRefs.current[0]
    slot.active = true
    slot.baseX = window.innerWidth / 2
    slot.baseY = window.innerHeight / 2
    slot.x = slot.baseX
    slot.y = slot.baseY
    slot.startTime = performance.now()
    if (node) node.style.display = 'block'
    // --- end temporary test spawn ---

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
        stepLerpTest(gem, now)
        node.style.transform = `translate3d(${gem.x}px, ${gem.y}px, 0)`
      }
      frameId = requestAnimationFrame(loop)
    }
    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 600 }}>
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
            willChange: 'transform',
          }}
        />
      ))}
    </div>
  )
}