import { JSX, useEffect, useRef, useState } from 'react'
import gemIcon from '../assets/gem.svg'
import { UPGRADE_NODES } from '../../../protocol/data/upgrade-nodes'

interface Props {
  onBack: () => void
  online: boolean
  gems: number
  purchasedUpgrades?: string[]
  onPurchase: (nodeId: string) => Promise<boolean>
}

const CURRENCY_ICONS: Record<string, string> = {
  gem: gemIcon,
}

function getState(node: { id: string, parents: string[] }, purchased: string[]): 'purchased' | 'available' | 'locked' {
  if (purchased.includes(node.id)) return 'purchased'
  if (node.parents.length === 0 || node.parents.every(pid => purchased.includes(pid))) return 'available'
  return 'locked'
}

const ZOOM_STEP = 0.1
const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.6

export default function UpgradesScreen({ onBack, online, gems, purchasedUpgrades = [], onPurchase }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const [, forceUpdate] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [insufficientFunds, setInsufficientFunds] = useState(false)
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const CANVAS_PAD = Math.max(400, window.innerWidth * 0.5 / zoom)
  
  const NODES_OFFSET_X = 80
  const NODES_OFFSET_Y = 100 * zoom

  const nodes = [...UPGRADE_NODES.entries()].map(([id, node]) => ({ id, ...node }))
  const minX = Math.min(...nodes.map(n => n.x)) // used to auto-center node tree

  const baseCanvasW = Math.max(...nodes.map(n => n.x)) - minX + CANVAS_PAD * 2
  const baseCanvasH = Math.max(...nodes.map(n => n.y)) + CANVAS_PAD
  const bgCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => { // initial camera position
    if (containerRef.current) {
      containerRef.current.scrollLeft = 750
      containerRef.current.scrollTop = 300
    }
  }, [])

  useEffect(() => {
    const canvas = bgCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = canvas.width = window.innerWidth
    const H = canvas.height = window.innerHeight

    ctx.fillStyle = 'rgb(11,11,17)'
    ctx.fillRect(0, 0, W, H)

    // Pointy-top hexagons, flat rows
    const size = 52  // circumradius
    const hexW = Math.sqrt(3) * size
    const hexH = 2 * size

    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 0.5

    const cols = Math.ceil(W / hexW) + 2
    const rows = Math.ceil(H / (hexH * 0.75)) + 2

    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        const cx = col * hexW + (row % 2 === 0 ? 0 : hexW / 2)
        const cy = row * hexH * 0.75
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 180) * (60 * i - 30)  // pointy-top
          const x = cx + size * Math.cos(angle)
          const y = cy + size * Math.sin(angle)
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.stroke()
      }
    }

    // Radial vignette on top
    const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H) * 0.75)
    grad.addColorStop(0, 'rgba(11,11,17,0)')
    grad.addColorStop(1, 'rgba(6,6,10,0.85)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
  }, [])

  useEffect(() => {
    forceUpdate(x => x + 1)
  }, [zoom])

  const toastRef = useRef<HTMLDivElement>(null)

  function showInsufficientFunds() {
    if (toastTimeout.current) clearTimeout(toastTimeout.current)
    const el = toastRef.current
    if (!el) return

    el.style.transition = 'none'
    el.style.top = '-80px'
    requestAnimationFrame(() => {
      el.style.transition = 'top 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)'
      el.style.top = '32px'
      toastTimeout.current = setTimeout(() => {
        el.style.top = '-80px'
      }, 2000)
    })
  }

  function drawConnectors() {
  const paths: JSX.Element[] = []
  const nodeW = 100
  const nodeH = 60

  nodes.forEach(node => {
    node.parents.forEach(pid => {
      const parentNode = nodes.find(n => n.id === pid)
      if (!parentNode) return

      const ax = parentNode.x - minX + 50 + CANVAS_PAD + nodeW / 2
      const ay = parentNode.y + NODES_OFFSET_Y + CANVAS_PAD * 0.3 + nodeH / 2
      const bx = node.x - minX + 50 + CANVAS_PAD + nodeW / 2
      const by = node.y + NODES_OFFSET_Y + CANVAS_PAD * 0.3 + nodeH / 2

      const dx = bx - ax
      const dy = by - ay

      let fx, fy, tx, ty
      if (Math.abs(dy) >= Math.abs(dx)) {
        // primarily vertical
        fx = ax; tx = bx
        fy = dy > 0 ? ay + nodeH / 2 : ay - nodeH / 2
        ty = dy > 0 ? by - nodeH / 2 : by + nodeH / 2
      } else {
        // primarily horizontal
        fy = ay; ty = by
        fx = dx > 0 ? ax + nodeW / 2 : ax - nodeW / 2
        tx = dx > 0 ? bx - nodeW / 2 : bx + nodeW / 2
      }

      const parentState = getState(parentNode, purchasedUpgrades)
      const color = parentState === 'purchased' ? 'rgba(0,255,153,0.35)' : 'rgba(255,255,255,0.22)'

      paths.push(
        <line
          key={`${pid}-${node.id}`}
          x1={fx} y1={fy}
          x2={tx} y2={ty}
          stroke={color}
          strokeWidth={2.5}
        />
      )
    })
  })
  return paths
}

  function handleZoom(dir: 1 | -1) {
    const container = containerRef.current
    if (!container) return

    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(zoom + dir * ZOOM_STEP).toFixed(1)))

    // center in terms of content (node-space), not canvas-space
    // subtract current CANVAS_PAD to get into node-space
    const currentPad = Math.max(400, window.innerWidth * 0.5 / zoom)
    const newPad = Math.max(400, window.innerWidth * 0.5 / newZoom)

    const centerXInContent = (container.scrollLeft + container.clientWidth / 2) / zoom - currentPad
    const centerYInContent = (container.scrollTop + container.clientHeight / 2) / zoom - currentPad * 0.3

    setZoom(newZoom)

    requestAnimationFrame(() => {
      container.scrollLeft = (centerXInContent + newPad) * newZoom - container.clientWidth / 2
      container.scrollTop = (centerYInContent + newPad * 0.3) * newZoom - container.clientHeight / 2
      forceUpdate(x => x + 1)
    })
  }

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'none',
      fontFamily: "'Share Tech', monospace",
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{
      `
        .upgrade-canvas::-webkit-scrollbar { display: none; }
        .upgrade-canvas { -ms-overflow-style: none; scrollbar-width: none; }
      `
      }</style>

      <div
        ref={toastRef}
        style={{
          position: 'fixed',
          top: insufficientFunds ? 32 : -80,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(20, 10, 10, 0.95)',
          border: '1.5px solid rgba(255, 80, 80, 0.5)',
          borderRadius: 8,
          padding: '12px 28px',
          fontSize: 28,
          letterSpacing: 2,
          color: 'rgba(255, 100, 100, 0.9)',
          pointerEvents: 'none',
          zIndex: 200,
          whiteSpace: 'nowrap',
        }}>
        NOT ENOUGH RESOURCES
      </div>

      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '16px 36px',
        position: 'absolute', top: 0, left: 0, right: 0,
        background: 'none',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'rgba(15, 15, 15, 0.8)', border: '3px solid rgba(255,255,255,0.2)',
            borderRadius: 7, padding: '7px 14px', cursor: 'pointer',
            color: 'rgba(255,255,255,0.5)', fontFamily: "'Share Tech', monospace",
            fontSize: 48, letterSpacing: 1, zIndex: 50,
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
        >
          ← Close
        </button>
        <span style={{ fontSize: 42, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', zIndex: 50, }}>
          upgrades
        </span>

        {/* zoom controls */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '16px 36px',
          marginLeft: 'auto',
          background: 'none',
          zIndex: 100,
        }}>
          <button
            onClick={() => handleZoom(-1)}
            style={{
              width: 54, height: 54, background: 'rgba(24, 24, 24, 0.8)',
              border: '0.7px solid rgba(255,255,255,0.2)', borderRadius: 6,
              color: 'rgba(255,255,255,0.5)', fontSize: 48, cursor: 'pointer',
              fontFamily: 'monospace', display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 50,
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'white'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          >-</button>
          <span style={{ fontSize: 30, letterSpacing: 1, color: 'rgba(182, 182, 182, 0.7)', minWidth: 72, textAlign: 'center', zIndex: 50, }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => handleZoom(1)}
            style={{
              width: 54, height: 54, background: 'rgba(24, 24, 24, 0.8)',
              border: '0.7px solid rgba(255,255,255,0.2)', borderRadius: 6,
              color: 'rgba(255,255,255,0.5)', fontSize: 32, cursor: 'pointer',
              fontFamily: 'monospace', display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 50,
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'white'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          >+</button>
        </div>
      </div>

      {/* scrollable canvas */}
      <div
        ref={containerRef}
        className="upgrade-canvas"
        onScroll={() => forceUpdate(x => x + 1)}
        style={{ 
          flex: 1, overflow: 'scroll', 
          position: 'relative', 
          background: 'transparent', 
          zIndex: 5
        }}
      >
        <canvas
        ref={bgCanvasRef}
        style={{
          position: 'fixed',
          top: 0, left: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
        {/* wrapper sized to zoomed canvas so scrollbars are accurate */}
        <div style={{ width: baseCanvasW * zoom, height: baseCanvasH * zoom, position: 'relative', zIndex: 5 }}>

          {/* scaled inner canvas */}
          <div style={{
            position: 'absolute', top: 0, left: 0,
            width: Math.max(baseCanvasW * zoom, window.innerWidth),
            height: Math.max(baseCanvasH * zoom, window.innerHeight),
            transform: `scale(${zoom})`,
            transformOrigin: '0 0',
          }}>

            {/* UPGRADES label */}
            <div style={{
              position: 'absolute',
              left: baseCanvasW * 0.5 - 225,
              top: NODES_OFFSET_Y + CANVAS_PAD * 0.3,
            }}>
              <div style={{ fontSize: 128, letterSpacing: 6, color: 'rgba(255, 230, 0, 0.41)', textTransform: 'uppercase' }}>
                upgrades
              </div>
              <div style={{ fontSize: 54, color: 'rgba(255,255,255,0.25)', letterSpacing: 2, textAlign: 'center' }}>
                {purchasedUpgrades.length} / {nodes.length} unlocked
              </div>
            </div>

            {/* svg connector layer */}
            <svg
              ref={svgRef}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
            >
              {drawConnectors()}
            </svg>

            {/* procedural nodes */}
            {nodes.map(node => {
              const state = getState(node, purchasedUpgrades)
              return (
                <div
                  key={node.id}
                  ref={el => { nodeRefs.current[node.id] = el }}
                  style={{
                    position: 'absolute',
                    left: node.x - minX + 50 + CANVAS_PAD,
                    top: node.y + NODES_OFFSET_Y + CANVAS_PAD * 0.3,
                    width: 100,
                    background: state === 'purchased'
                      ? 'rgba(16,28,22,1)'
                      : state === 'available'
                      ? 'rgba(26,24,14,1)'
                      : 'rgba(18,18,24,0.7)',

                    border: state === 'purchased'
                      ? '2px solid rgba(0,255,153,0.5)'
                      : state === 'available'
                      ? '2px solid rgba(255,221,0,0.5)'
                      : '2px solid rgba(255,255,255,0.1)',
                    opacity: 1,
                    borderRadius: 10,
                    padding: '10px 0px 9px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                    cursor: state === 'available' ? 'pointer' : 'default',
                    transition: 'border-color 0.15s, background 0.15s',
                    zIndex: 99
                  }}
                  onClick={() => {
                    if (state === 'available') {
                        onPurchase(node.id).then(success => {
                          if (!success) showInsufficientFunds()
                        })
                      }
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
                  <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.38)', lineHeight: 1.5, fontFamily: 'sans-serif', padding:'0px 7px 0px 7px', zIndex: 99 }}>
                    {node.desc}
                  </div>

                  {state === 'purchased' && (
                    <div style={{ fontSize: 16, paddingLeft: 7, letterSpacing: 1.5, color: 'rgba(0,255,153,0.55)' }}>✓ owned</div>
                  )}
                  {state === 'locked' && (
                    <div style={{ fontSize: 12, paddingLeft: 7, letterSpacing: 1, color: 'rgba(255,255,255,0.2)' }}>🔒 locked</div>
                  )}
                  {state === 'available' && (
                    <div style={{ display: 'flex', paddingLeft: 7, flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                      {node.cost.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 22, letterSpacing: 1, color: 'rgba(255,255,255,0.5)' }}>
                          <img src={CURRENCY_ICONS[c.currency]} alt={c.currency} style={{ width: 24, height: 24 }} />
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