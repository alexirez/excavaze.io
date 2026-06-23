import { JSX, useEffect, useRef, useState } from 'react'
import { UPGRADE_NODES, UpgradeNode } from '../../../protocol/upgrade-nodes'

interface Props {
  onBack: () => void
  purchasedUpgrades?: string[]
}

const CURRENCY_ICONS: Record<string, string> = {
  gem: '/assets/gem.svg',
  green_core: '/assets/green-core.svg',
  purple_core: '/assets/purple-core.svg',
  yellow_core: '/assets/yellow-core.svg',
}
const NODES_OFFSET_X = 80
const NODES_OFFSET_Y = 0

function getState(node: UpgradeNode, purchased: string[]): 'purchased' | 'available' | 'locked' {
  if (purchased.includes(node.id)) return 'purchased'
  if (node.parents.length === 0 || node.parents.every(pid => purchased.includes(pid))) return 'available'
  return 'locked'
}

const CANVAS_PAD = 400
const ZOOM_STEP = 0.1
const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.6

export default function UpgradesScreen({ onBack, purchasedUpgrades = [] }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const [, forceUpdate] = useState(0)
  const [zoom, setZoom] = useState(1)

  const baseCanvasW = Math.max(...UPGRADE_NODES.map(n => n.x)) + 200 + CANVAS_PAD
  const baseCanvasH = Math.max(...UPGRADE_NODES.map(n => n.y)) + 200 + CANVAS_PAD

  useEffect(() => {
    setTimeout(() => forceUpdate(x => x + 1), 50)
  }, [])

  useEffect(() => {
    setTimeout(() => forceUpdate(x => x + 1), 30)
  }, [zoom])

  function drawConnectors() {
    if (!svgRef.current || !containerRef.current) return null
    const containerRect = containerRef.current.getBoundingClientRect()
    const paths: JSX.Element[] = []

    UPGRADE_NODES.forEach(node => {
      node.parents.forEach(pid => {
        const parentNode = UPGRADE_NODES.find(n => n.id === pid)
        const fromEl = nodeRefs.current[pid]
        const toEl = nodeRefs.current[node.id]
        if (!fromEl || !toEl || !parentNode) return

        const fr = fromEl.getBoundingClientRect()
        const tr = toEl.getBoundingClientRect()
        const scroll = containerRef.current!

        const fx = (fr.left - containerRect.left + scroll.scrollLeft) / zoom + fr.width / zoom / 2
        const fy = (fr.top - containerRect.top + scroll.scrollTop) / zoom + fr.height / zoom
        const tx = (tr.left - containerRect.left + scroll.scrollLeft) / zoom + tr.width / zoom / 2
        const ty = (tr.top - containerRect.top + scroll.scrollTop) / zoom

        const cy = (fy + ty) / 2
        const parentState = getState(parentNode, purchasedUpgrades)
        const active = parentState === 'purchased'
        const color = active ? 'rgba(0,255,153,0.35)' : 'rgba(255,255,255,0.08)'

        paths.push(
          <path
            key={`${pid}-${node.id}`}
            d={`M${fx},${fy} C${fx},${cy} ${tx},${cy} ${tx},${ty}`}
            stroke={color}
            strokeWidth={2.5}
            fill="none"
          />
        )
      })
    })
    return paths
  }

  function handleZoom(dir: 1 | -1) {
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + dir * ZOOM_STEP).toFixed(1))))
  }

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(14,14,20,0.97)',
      fontFamily: "'Share Tech', monospace",
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        .upgrade-scroll::-webkit-scrollbar { display: none; }
        .upgrade-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 24px',
        borderBottom: '0.5px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: 7, padding: '7px 14px', cursor: 'pointer',
            color: 'rgba(255,255,255,0.5)', fontFamily: "'Share Tech', monospace",
            fontSize: 12, letterSpacing: 1,
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
        >
          ← back
        </button>
        <span style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
          upgrades
        </span>

        {/* zoom controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <button
            onClick={() => handleZoom(-1)}
            style={{
              width: 28, height: 28, background: 'rgba(255,255,255,0.06)',
              border: '0.5px solid rgba(255,255,255,0.13)', borderRadius: 6,
              color: 'rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer',
              fontFamily: 'monospace', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'white'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          >−</button>
          <span style={{ fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.3)', minWidth: 36, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => handleZoom(1)}
            style={{
              width: 28, height: 28, background: 'rgba(255,255,255,0.06)',
              border: '0.5px solid rgba(255,255,255,0.13)', borderRadius: 6,
              color: 'rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer',
              fontFamily: 'monospace', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'white'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          >+</button>
        </div>
      </div>

      {/* scrollable canvas */}
      <div
        ref={containerRef}
        className="upgrade-scroll"
        onScroll={() => forceUpdate(x => x + 1)}
        style={{
          flex: 1,
          overflow: 'scroll',
          position: 'relative',
        }}
      >
        {/* wrapper sized to zoomed canvas so scrollbars are accurate */}
        <div style={{ width: baseCanvasW * zoom, height: baseCanvasH * zoom, position: 'relative' }}>

          {/* scaled inner canvas */}
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: baseCanvasW, height: baseCanvasH,
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
          }}>

            {/* svg connector layer */}
            <svg
              ref={svgRef}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
            >
              {drawConnectors()}
            </svg>

            {/* nodes */}
            {UPGRADE_NODES.map(node => {
              const state = getState(node, purchasedUpgrades)
              return (
                <div
                  key={node.id}
                  ref={el => { nodeRefs.current[node.id] = el }}
                  style={{
                    position: 'absolute',
                    left: node.x + NODES_OFFSET_X,
                    top: node.y + NODES_OFFSET_Y,
                    width: 130,
                    background: 'rgba(20,20,30,0.95)',
                    borderRadius: 10,
                    padding: '10px 12px 9px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    border: state === 'purchased'
                      ? '1px solid rgba(0,255,153,0.4)'
                      : state === 'available'
                      ? '1px solid rgba(255,221,0,0.35)'
                      : '0.5px solid rgba(255,255,255,0.09)',
                    opacity: state === 'locked' ? 0.4 : 1,
                    cursor: state === 'available' ? 'pointer' : 'default',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (state === 'available') {
                      e.currentTarget.style.background = 'rgba(30,30,44,0.98)'
                      e.currentTarget.style.borderColor = 'rgba(255,221,0,0.7)'
                    }
                  }}
                  onMouseLeave={e => {
                    if (state === 'available') {
                      e.currentTarget.style.background = 'rgba(20,20,30,0.95)'
                      e.currentTarget.style.borderColor = 'rgba(255,221,0,0.35)'
                    }
                  }}
                >
                  <img src={`/assets/${node.icon}`} alt="" style={{ width: 24, height: 24 }} />
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', lineHeight: 1.5, fontFamily: 'sans-serif' }}>
                    {node.desc}
                  </div>

                  {state === 'purchased' && (
                    <div style={{ fontSize: 9, letterSpacing: 1.5, color: 'rgba(0,255,153,0.55)' }}>✓ owned</div>
                  )}
                  {state === 'locked' && (
                    <div style={{ fontSize: 9, letterSpacing: 1, color: 'rgba(255,255,255,0.2)' }}>🔒 locked</div>
                  )}
                  {state === 'available' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                      {node.cost.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.5)' }}>
                          <img src={CURRENCY_ICONS[c.currency]} alt={c.currency} style={{ width: 11, height: 11 }} />
                          <span>{c.amount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}