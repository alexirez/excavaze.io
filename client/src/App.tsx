import React, { useState, useEffect } from 'react'
import PhaserGame, { phaserGame } from './core/PhaserGame'
import socket, { addSocketListener, getLocalId, removeSocketListener } from './network/socket'
import { RespawnMessage, ServerMessage } from '../../protocol/messages'
import { GameScene } from './scenes/GameScene'

interface KillFeedEntry {
  id: number
  victimId: number
  killerId?: number
  killerName?: string
  victimName: string
  exiting: boolean
}

const TIPS_PLAYER = [
  "Tip: Ramming into other players deals damage to both of you.",
  "Tip: Avoid large players!.",
]
const TIPS_DRILL = [
  "Tip: Your drill length can be upgraded to reach enemies from a safer distance.",
  "Tip: Avoid large players!.",
  "Tip: Upgrade your speed to escape hostile players",
]
const TIPS_SQUARE = [
  "Tip: Bigger squares deal more damage.",
  "Tip: Some areas are more dense than others. Dense areas are more dangerous.",
  "You died to a square? Seriously?",
]
const TIPS_GENERAL = [
  "Tip: Your player level in battle is limited based on the Max Level upgrade. Purchase upgrades to get stronger!",
  "Tip: Larger squares give more xp."
]

function pickTip(cause: 'player' | 'drill' | 'square'): string {
  if (Math.random() < 0.2) // 20% chance of general tip
    return TIPS_GENERAL[Math.floor(Math.random() * TIPS_GENERAL.length)]
  const pools = { player: TIPS_PLAYER, drill: TIPS_DRILL, square: TIPS_SQUARE }
  const pool = pools[cause]
  return pool[Math.floor(Math.random() * pool.length)]
}

function formatXp(xp: number): string {
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(3)}m`
  if (xp >= 10_000) return `${(xp / 1_000).toFixed(1)}k`
  if (xp >= 1_000) return `${(xp / 1_000).toFixed(2)}k`
  return `${xp.toFixed(0)}`
}

export default function App() {
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([])
  const [isDead, setIsDead] = useState(false)
  const [deathVisible, setDeathVisible] = useState(false)
  const [killerName, setKillerName] = useState('')
  const [deathTip, setDeathTip] = useState('')
  const [leaderboard, setLeaderboard] = useState<{ id: number, name: string, xp: number }[]>([])

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

      if (msg.type === 'world_state') {
        const sorted = [...msg.players]
          .sort((a, b) => b.xp - a.xp)
          .slice(0, 10)
        setLeaderboard(sorted)
      } else if (msg.type === 'player_killed') {
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
        setDeathTip(pickTip(msg.cause))
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
        right: 230,
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
            <span style={{ color: entry.victimId === getLocalId() ? '#ffdd00' : '#ff6b6b' }}>
              {entry.victimName}
            </span>
            <span style={{ color: '#aaa' }}> was killed by </span>
            {entry.killerName ? (
              <span style={{ color: entry.killerId === getLocalId() ? '#ffdd00' : '#ff6b6b' }}>
                {entry.killerName}
              </span>
            ) : (
              <span style={{ color: '#f5a623' }}>a Square</span>
            )}
          </div>
        ))}
      </div>

      {/* leaderboard */}
      <div style={{
        position: 'absolute',
        top: 20,
        right: 20,
        fontFamily: "'Share Tech', sans-serif",
        pointerEvents: 'none',
        transform: isDead ? 'translateX(200px)' : 'translateX(0)',
        opacity: isDead ? 0 : 1,
        transition: isDead ? 'transform 0.4s ease, opacity 0.4s ease' : 'none',
      }}>
        {/* background rectangle */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 16,
          padding: '8px 16px',
        }} />

        {/* entries */}
        <div style={{ position: 'relative', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 5, minWidth: 190 }}>
          {Array.from({ length: 10 }).map((_, i) => {
            const p = leaderboard[i]
            return (
              <div key={i} style={{
                color: p ? (p.id === getLocalId() ? '#ffdd00' : 'white') : '#555555',
                fontSize: 15,
                whiteSpace: 'nowrap',
                display: 'flex',
                gap: 6,
              }}>
                <span style={{ width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ flex: 1 }}>{p ? p.name : '·'}</span>
                <span style={{ textAlign: 'right', flexShrink: 0, color: p?.id === getLocalId() ? '#ffdd00' : '#aaaaaa' }}>
                  {p ? `${formatXp(p.xp)}` : ''}
                </span>
              </div>
            )
          })}
        </div>
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
              const scene = phaserGame?.scene.getScene('GameScene') as GameScene
              scene?.showHud()
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