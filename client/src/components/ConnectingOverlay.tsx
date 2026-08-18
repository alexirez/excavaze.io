import { useEffect, useState } from 'react'

interface Props {
  visible: boolean
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export default function ConnectingOverlay({ visible }: Props) {
  const [dots, setDots] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!visible) return
    const interval = setInterval(() => setDots(d => (d + 1) % 4), 400)
    return () => clearInterval(interval)
  }, [visible])

  useEffect(() => {
    if (!visible) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 500)
    return () => clearInterval(interval)
  }, [visible])

  if (!visible) return null

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(14,14,20,0.9)',
      fontFamily: "'Share Tech', monospace",
      zIndex: 100,
      pointerEvents: 'none',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      }}>
        <div style={{ fontSize: 22, letterSpacing: 2, color: '#ffdd00', fontVariantNumeric: 'tabular-nums', paddingBottom: 22, }}>
          {formatElapsed(elapsed)}
        </div>
        <div style={{
          fontSize: 22, letterSpacing: 3, color: '#ffffff',
          display: 'flex', alignItems: 'center',
        }}>
          <span>CONNECTING</span>
          <span style={{ width: 28, textAlign: 'left', }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{ opacity: i < dots ? 1 : 0 }}>.</span>
          ))}
        </span>
        </div>
        <div style={{ fontSize: 12, letterSpacing: 1, color: 'rgba(255,255,255,0.5)', maxWidth: 320, textAlign: 'center', lineHeight: 1.6, paddingTop: 22, }}>
          This normally takes up to 50 seconds.
          <br></br>If it takes longer, the server is probably down.
        </div>
      </div>
    </div>
  )
}