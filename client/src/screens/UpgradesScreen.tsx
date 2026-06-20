import React from 'react'

interface Props {
  onBack: () => void
}

export default function UpgradesScreen({ onBack }: Props) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(14,14,20,0.95)',
      fontFamily: "'Share Tech', monospace",
      color: 'white',
    }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer' }}>
        ← back (stub)
      </button>
    </div>
  )
}