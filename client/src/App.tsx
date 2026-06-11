import React, { useState, useEffect } from 'react'
import PhaserGame from './core/PhaserGame'
import socket, { addSocketListener, getLocalId, removeSocketListener } from './network/socket'
import { RespawnMessage, ServerMessage } from '../../protocol/messages'

interface KillFeedEntry {
  id: number
  victimId: number
  killerId?: number
  killerName?: string
  victimName: string
  exiting: boolean
}

const DEATH_TIPS = [
  "Tip: Bigger squares deal more damage but grant more xp.",
  "Tip: Your drill length can be upgraded to reach enemies from a safer distance.",
  "Tip: Ramming into other players deals damage to both of you.",
  "Tip: Some areas are more dense than others.",
  "Tip: Avoid large players!.",
]

export default function App() {
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([])
  const [isDead, setIsDead] = useState(false)
  const [deathVisible, setDeathVisible] = useState(false)
  const [killerName, setKillerName] = useState('')
  const [deathTip, setDeathTip] = useState('')

  useEffect(() => {
    if (isDead) {
      requestAnimationFrame(() => setDeathVisible(true))
    } else {
      setDeathVisible(false)
    }
  }, [isDead])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data) as ServerMessage

      if (msg.type === 'player_killed') {
        const id = Date.now()
        setKillFeed(prev => [...prev, { id, victimId: msg.victimId, killerId: msg.killerId, killerName: msg.killerName, victimName: msg.victimName, exiting: false }])
        setTimeout(() => {
          setKillFeed(prev => prev.map(e => e.id === id ? { ...e, exiting: true } : e))
        }, 4500)
        setTimeout(() => {
          setKillFeed(prev => prev.filter(e => e.id !== id))
        }, 5000)
      } else if (msg.type === 'square_killed_player') {
        const id = Date.now()
        setKillFeed(prev => [...prev, { id, victimId: msg.victimId, victimName: msg.victimName, exiting: false }])
        setTimeout(() => {
          setKillFeed(prev => prev.map(e => e.id === id ? { ...e, exiting: true } : e))
        }, 4500)
        setTimeout(() => {
          setKillFeed(prev => prev.filter(e => e.id !== id))
        }, 5000)
      } else if (msg.type === 'death_screen') {
        setIsDead(true)
        setKillerName(msg.killerName)
        setDeathTip(DEATH_TIPS[Math.floor(Math.random() * DEATH_TIPS.length)])
      }
    }
    addSocketListener(handler)
    return () => removeSocketListener(handler)
  }, [])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <PhaserGame />

      {/* kill feed */}
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
            <span style={{ color: entry.victimId === getLocalId() ? '#00ff99' : '#ff6b6b' }}>
              {entry.victimName}
            </span>
            <span style={{ color: '#aaa' }}> was killed by </span>
            {entry.killerName ? (
              <span style={{ color: entry.killerId === getLocalId() ? '#00ff99' : '#ff6b6b' }}>
                {entry.killerName}
              </span>
            ) : (
              <span style={{ color: '#f5a623' }}>a Square</span>
            )}
          </div>
        ))}
      </div>

      {/* death screen */}
      {isDead && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '60vw',
          height: '60vh',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0,0,0,0.7)',
          opacity: deathVisible ? 1 : 0,
          transform: deathVisible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.5)',
          transition: 'opacity 1s ease, transform 1s ease',
          pointerEvents: isDead ? 'auto' : 'none',
        }}>
          <span style={{ color: '#ff3333', fontSize: 36, fontWeight: 'bold', display: 'block',
            textAlign: 'center' }}>
            You Were Killed by <span>{killerName}</span>
          </span>
          <span style={{ color: '#aaa', fontSize: 14, marginTop: 16, textAlign: 'center', padding: '0 24px' }}>
            {deathTip}
          </span>
          <button
            onClick={() => {
              socket.send(JSON.stringify({ type: 'respawn' } satisfies RespawnMessage))
              setIsDead(false)
              setKillFeed([])
            }}
            style={{
              marginTop: 24,
              padding: '10px 32px',
              fontSize: 16,
              background: '#00ff99',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  )
}