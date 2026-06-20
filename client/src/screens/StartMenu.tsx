import React from 'react'

interface Props {
  onPlay: () => void
}

export default function StartMenu({ onPlay }: Props) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(14,14,20,0.85)',
      fontFamily: "'Share Tech', monospace",
      color: 'white', fontSize: 32,
    }}>
      <button onClick={onPlay} style={{ background: 'none', border: 'none', color: 'white', fontSize: 32, cursor: 'pointer' }}>
        click to play (temp)
      </button>
    </div>
  )
}