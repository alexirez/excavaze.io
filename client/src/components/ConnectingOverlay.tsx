import { useEffect, useState } from 'react'

interface Props {
  visible: boolean
}

export default function ConnectingOverlay({ visible }: Props) {
  const [dots, setDots] = useState(0)

  useEffect(() => {
    if (!visible) return
    const interval = setInterval(() => setDots(d => (d + 1) % 4), 400)
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
        fontSize: 22, letterSpacing: 3, color: '#ffffff',
        display: 'flex', alignItems: 'baseline',
      }}>
        <span>CONNECTING</span>
        <span style={{ width: 28, textAlign: 'left' }}>{'.'.repeat(dots)}</span>
      </div>
    </div>
  )
}