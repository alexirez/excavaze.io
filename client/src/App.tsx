import React, { useState, useEffect } from 'react'
import PhaserGame from './core/PhaserGame'
import { addSocketListener, removeSocketListener } from './network/socket'
import { ServerMessage } from '../../protocol/messages'

interface KillFeedEntry {
  id: number
  killerName: string
  victimName: string
  exiting: boolean
}

export default function App() {
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data) as ServerMessage
      if (msg.type === 'player_killed') {
        const id = Date.now()
        setKillFeed(prev => [...prev, { id, killerName: msg.killerName, victimName: msg.victimName, exiting: false }])
        setTimeout(() => {
          setKillFeed(prev => prev.map(e => e.id === id ? { ...e, exiting: true } : e))
        }, 4500)
        setTimeout(() => {
          setKillFeed(prev => prev.filter(e => e.id !== id))
        }, 5000)
      }
    }
    addSocketListener(handler)
    return () => removeSocketListener(handler)
  }, [])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <PhaserGame />
      <div style={{
        position: 'absolute',
        top: 20,
        right: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 6,
        pointerEvents: 'none',
      }}>
        {killFeed.map(entry => (
          <div key={entry.id} style={{
            opacity: entry.exiting ? 0 : 1,
            transform: entry.exiting ? 'translateX(100px)' : 'translateX(0)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: 13,
            whiteSpace: 'nowrap',
          }}>
            <span style={{ color: '#ff6b6b' }}>{entry.killerName}</span>
            <span style={{ color: '#aaa' }}> killed </span>
            <span style={{ color: '#00ff99' }}>{entry.victimName}</span>
          </div>
        ))}
      </div>
    </div>
  )
}