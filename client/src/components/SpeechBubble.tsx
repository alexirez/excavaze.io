import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'

type Side = 'top' | 'bottom' | 'left' | 'right'

interface SpeechBubbleProps {
  /** Ref to the element the bubble points at. */
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Order of sides to try, first fit wins. Default: above, below, right, left. */
  preferredOrder?: Side[]
}

const RADIUS = 12
const TAIL_LENGTH = 12
const TAIL_HALF = 12
const MARGIN = 8

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(v, hi))
}

/**
 * Builds a single closed SVG path: a rounded rect fused with a bezier-tipped
 * tail on one edge. `tc` (tail center) is the position of the tail along
 * that edge, in box-local coordinates.
 */
function buildPath(side: Side, boxW: number, boxH: number, tc: number) {
  const r = RADIUS
  const tl = TAIL_LENGTH
  const th = TAIL_HALF

  if (side === 'bottom') {
    return {
      vbW: boxW,
      vbH: boxH + tl,
      d: `M${r},0 H${boxW - r} A${r},${r} 0 0 1 ${boxW},${r} V${boxH - r} A${r},${r} 0 0 1 ${boxW - r},${boxH} H${tc + th} C${tc + th * 0.6},${boxH + tl * 0.3} ${tc + th * 0.3},${boxH + tl * 0.7} ${tc},${boxH + tl} C${tc - th * 0.3},${boxH + tl * 0.7} ${tc - th * 0.6},${boxH + tl * 0.3} ${tc - th},${boxH} H${r} A${r},${r} 0 0 1 0,${boxH - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`,
    }
  }
  if (side === 'top') {
    return {
      vbW: boxW,
      vbH: boxH + tl,
      d: `M${tc - th},${tl} C${tc - th * 0.6},${tl * 0.7} ${tc - th * 0.3},${tl * 0.3} ${tc},0 C${tc + th * 0.3},${tl * 0.3} ${tc + th * 0.6},${tl * 0.7} ${tc + th},${tl} H${boxW - r} A${r},${r} 0 0 1 ${boxW},${tl + r} V${tl + boxH - r} A${r},${r} 0 0 1 ${boxW - r},${tl + boxH} H${r} A${r},${r} 0 0 1 0,${tl + boxH - r} V${tl + r} A${r},${r} 0 0 1 ${r},${tl} Z`,
    }
  }
  if (side === 'right') {
    return {
      vbW: boxW + tl,
      vbH: boxH,
      d: `M${r},0 H${boxW - r} A${r},${r} 0 0 1 ${boxW},${r} V${tc - th} C${boxW + tl * 0.3},${tc - th * 0.6} ${boxW + tl * 0.7},${tc - th * 0.3} ${boxW + tl},${tc} C${boxW + tl * 0.7},${tc + th * 0.3} ${boxW + tl * 0.3},${tc + th * 0.6} ${boxW},${tc + th} V${boxH - r} A${r},${r} 0 0 1 ${boxW - r},${boxH} H${r} A${r},${r} 0 0 1 0,${boxH - r} V${r} A${r},${r} 0 0 1 ${r},0 Z`,
    }
  }
  // left
  return {
    vbW: boxW + tl,
    vbH: boxH,
    d: `M${tl + r},0 H${tl + boxW - r} A${r},${r} 0 0 1 ${tl + boxW},${r} V${boxH - r} A${r},${r} 0 0 1 ${tl + boxW - r},${boxH} H${tl + r} A${r},${r} 0 0 1 ${tl},${boxH - r} V${tc + th} C${tl * 0.7},${tc + th * 0.6} ${tl * 0.3},${tc + th * 0.3} 0,${tc} C${tl * 0.3},${tc - th * 0.3} ${tl * 0.7},${tc - th * 0.6} ${tl},${tc - th} V${r} A${r},${r} 0 0 1 ${tl + r},0 Z`,
  }
}

export default function SpeechBubble({ anchorRef, open, onClose, children, preferredOrder }: SpeechBubbleProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const [placement, setPlacement] = useState<{ side: Side; left: number; top: number; tc: number } | null>(null)

  // reset on close so we re-measure fresh next time (content may change)
  useEffect(() => {
    if (!open) {
      setBox(null)
      setPlacement(null)
    }
  }, [open])

  // measure content size
  useLayoutEffect(() => {
    if (!open || !contentRef.current) return
    const el = contentRef.current
    const measure = () => setBox({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  // compute placement against the viewport, re-run on resize/scroll
  useLayoutEffect(() => {
    if (!open || !box || !anchorRef.current) return

    function compute() {
      const a = anchorRef.current!.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const cx = a.left + a.width / 2
      const cy = a.top + a.height / 2

      const spaceAbove = a.top
      const spaceBelow = vh - a.bottom
      const spaceLeft = a.left
      const spaceRight = vw - a.right

      const needV = box!.h + TAIL_LENGTH + MARGIN
      const needH = box!.w + TAIL_LENGTH + MARGIN

      function fits(s: Side) {
        if (s === 'bottom') return spaceAbove >= needV // box above anchor, tail points down
        if (s === 'top') return spaceBelow >= needV // box below anchor, tail points up
        if (s === 'right') return spaceLeft >= needH // box left of anchor, tail points right
        return spaceRight >= needH // 'left': box right of anchor, tail points left
      }

      const order = preferredOrder ?? (['bottom', 'top', 'right', 'left'] as Side[])
      const side = order.find(fits) ?? (spaceAbove >= spaceBelow ? 'bottom' : 'top')

      let left: number
      let top: number
      let tc: number

      if (side === 'bottom' || side === 'top') {
        left = clamp(cx - box!.w / 2, MARGIN, vw - box!.w - MARGIN)
        tc = clamp(cx - left, RADIUS + TAIL_HALF, box!.w - RADIUS - TAIL_HALF)
        top = side === 'bottom' ? a.top - TAIL_LENGTH - box!.h : a.bottom + TAIL_LENGTH
      } else {
        top = clamp(cy - box!.h / 2, MARGIN, vh - box!.h - MARGIN)
        tc = clamp(cy - top, RADIUS + TAIL_HALF, box!.h - RADIUS - TAIL_HALF)
        left = side === 'right' ? a.left - TAIL_LENGTH - box!.w : a.right + TAIL_LENGTH
      }

      setPlacement({ side, left, top, tc })
    }

    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [open, box, anchorRef, preferredOrder])

  // close on outside click / escape
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node
      if (bubbleRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  const ready = box !== null && placement !== null
  const side = placement?.side ?? 'bottom'
  const boxW = box?.w ?? 0
  const boxH = box?.h ?? 0
  const tc = placement?.tc ?? 0

  const { vbW, vbH, d } = ready ? buildPath(side, boxW, boxH, tc) : { vbW: 0, vbH: 0, d: '' }

  // content sits at (0,0) inside the box rect; for 'top'/'left' sides the
  // svg viewBox extends beyond the box rect to fit the tail, so the content
  // needs to be nudged over by the tail length.
  const contentX = side === 'left' ? TAIL_LENGTH : 0
  const contentY = side === 'top' ? TAIL_LENGTH : 0

  return (
    <div
      ref={bubbleRef}
      style={{
        position: 'fixed',
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        opacity: ready ? 1 : 0,
        pointerEvents: ready ? 'auto' : 'none',
        zIndex: 1000,
      }}
    >
      {ready && (
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          width={vbW}
          height={vbH}
          style={{ position: 'absolute', top: 0, left: 0, display: 'block', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.45))' }}
        >
          <path d={d} fill="rgba(20,20,28,0.98)" stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} />
        </svg>
      )}
      <button
        onClick={onClose}
        aria-label="close"
        style={{
          position: 'absolute',
          top: contentY + 6,
          left: contentX + boxW - 24,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.4)',
          fontSize: 16,
          lineHeight: 1,
          padding: 4,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
      >
        X
      </button>
      <div
        ref={contentRef}
        style={{
          position: 'absolute',
          left: contentX,
          top: contentY,
          display: 'inline-flex',
        }}
      >
        {children}
      </div>
    </div>
  )
}