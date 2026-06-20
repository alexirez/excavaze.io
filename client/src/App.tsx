import React, { useState, useEffect, useRef } from 'react'
import PhaserGame, { phaserGame } from './core/PhaserGame'
import socket, { addSocketListener, getLocalId, removeSocketListener } from './network/socket'
import { RespawnMessage, ServerMessage } from '../../protocol/messages'
import { GameScene } from './scenes/GameScene'
import { currentLevel, xpForNextLevel, xpThisLevel } from '../../protocol/utils'
import { PERK_TREE, RARITY_CONFIG, rollPerkChoices } from '../../protocol/perks'

type Screen = 'startMenu' // start screen
  | 'game' // in battle and death screen
  | 'upgrades' // upgrades menu

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
  const [screen, setScreen] = useState<Screen>('startMenu')
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([])
  const [xpRatio, setXpRatio] = useState(0)
  const [xpLevel, setXpLevel] = useState(1)
  const [xpIsMax, setXpIsMax] = useState(false)
  const [isDead, setIsDead] = useState(false)
  const [deathVisible, setDeathVisible] = useState(false)
  const [killerName, setKillerName] = useState('')
  const [deathTip, setDeathTip] = useState('')
  const [leaderboard, setLeaderboard] = useState<{ id: number, name: string, xp: number }[]>([])
  const [perkChoices, setPerkChoices] = useState<string[] | null>(null)
  const [perkVisible, setPerkVisible] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const lastPerkChoiceTime = useRef<number>(0)
  const perkChoicesRef = useRef<string[] | null>(null)

  useEffect(() => {
    if (isDead) {
      requestAnimationFrame(() => setDeathVisible(true))
      setPerkVisible(false)
      perkChoicesRef.current = null
      setTimeout(() => setPerkChoices(null), 300)
    } else {
      setDeathVisible(false)
    }
  }, [isDead])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data) as ServerMessage

      if (msg.type === 'world_state') {
        const sorted = [...msg.players] // 1. Handle leaderboard
          .sort((a, b) => b.xp - a.xp)
          .slice(0, 10)
        setLeaderboard(sorted)
        const localId = getLocalId() // 2. Handle perk selection
        const local = msg.players.find(p => p.id === localId)
        if (local) {
          const pending = currentLevel(local.xp) - local.collectedPerks.length
          setPendingCount(pending)
          if (pending > 0 && !perkChoicesRef.current && Date.now() > lastPerkChoiceTime.current + 500) {
            const choices = rollPerkChoices(local.collectedPerks)
            setPerkChoices(choices)
            perkChoicesRef.current = choices
            requestAnimationFrame(() => setPerkVisible(true))
          }
          const level = currentLevel(local.xp)
            setXpLevel(level + 1)
            setXpRatio(xpThisLevel(local.xp) / xpForNextLevel(local.xp))
            setXpIsMax(level >= 6)
        }
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
      {screen === 'startMenu' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(14,14,20,0.85)',
          fontFamily: "'Share Tech', monospace",
          color: 'white', fontSize: 32,
        }}>
          <button onClick={() => setScreen('game')} style={{ background: 'none', border: 'none', color: 'white', fontSize: 32, cursor: 'pointer' }}>
            click to play (temp)
          </button>
        </div>
      )}
      {screen === 'game' && <>
        {/* xp bar */}
        {screen === 'game' && !isDead && (
        <div style={{
          position: 'absolute',
          top: 20,
          left: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          pointerEvents: 'none',
          fontFamily: "'Share Tech', sans-serif",
        }}>
          <span style={{ fontSize: 12, color: 'white' }}>LVL {xpLevel}</span>
          <div style={{ width: 200, height: 12, background: '#333333', position: 'relative' }}>
            <div style={{
              width: `${xpRatio * 100}%`,
              height: 10,
              background: '#ffdd00',
              position: 'absolute',
              top: 0, left: 0,
            }} />
          </div>
          {xpIsMax && (
            <div style={{
              background: '#444444',
              borderRadius: 4,
              padding: '1px 6px',
            }}>
              <span style={{ fontSize: 12, color: '#ffdd00' }}>MAX</span>
            </div>
          )}
        </div>
      )}

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

        {/* perk selection */}
        {perkChoices && (
        <div style={{
          position: 'absolute',
          top: '60%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          pointerEvents: 'auto',
          zIndex: 100,
          opacity: perkVisible ? 1 : 0,
          translate: perkVisible ? '0 0' : '0 40px',
          transition: 'opacity 0.3s ease, translate 0.3s ease',
        }}>
          {/* pending count badge */}
          {pendingCount > 1 && (
            <div style={{
              color: '#ffdd00',
              fontFamily: "'Share Tech', sans-serif",
              fontSize: 13,
              background: 'rgba(0,0,0,0.6)',
              padding: '2px 10px',
              borderRadius: 99,
            }}>
              +{pendingCount - 1} upgrade{pendingCount - 1 > 1 ? 's' : ''} pending
            </div>
          )}

          {/* cards row */}
          <div style={{ display: 'flex', gap: 16 }}>
            {perkChoices.map(perkId => {
              const perk = PERK_TREE[perkId]
              const rarityColor = RARITY_CONFIG[perk.rarity].color
              return (
                <div
                  key={perkId}
                  onClick={() => {
                    socket.send(JSON.stringify({ type: 'select_perk', perkId }))
                    lastPerkChoiceTime.current = Date.now()
                    setPerkVisible(false)
                    perkChoicesRef.current = null
                    setTimeout(() => setPerkChoices(null), 300) // wait for fade-up animation
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  style={{
                    width: 140,
                    padding: '14px 16px',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.6)',
                    border: `2px solid ${rarityColor}`,
                    color: 'white',
                    cursor: 'pointer',
                    fontFamily: "'Share Tech', sans-serif",
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    transition: 'transform 0.15s ease',
                  }}
                >
                  <span style={{ color: rarityColor, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
                    {perk.rarity}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 'bold' }}>{perk.title}</span>
                  <span style={{ fontSize: 12, color: '#aaa', whiteSpace: 'pre-line' }}>{perk.desc}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

        {/* death screen */}
        {isDead && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 600,
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'rgba(20,20,28,0.95)',
          border: '0.5px solid rgba(255,255,255,0.1)',
          padding: '52px 64px',
          opacity: deathVisible ? 1 : 0,
          transform: deathVisible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.5)',
          transition: 'opacity 1s ease, transform 1s ease',
          pointerEvents: isDead ? 'auto' : 'none',
        }}>
          <span style={{ fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,100,100,0.9)', marginBottom: 10 }}>
            eliminated
          </span>
          <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
            you were killed by
          </span>
          <span style={{ fontSize: 52, color: 'rgba(255,100,100,0.9)', letterSpacing: 1, marginBottom: 28 }}>
            {killerName}
          </span>
          <div style={{ width: '100%', height: 0.5, background: 'rgba(255,255,255,0.55)', marginBottom: 24 }} />
          <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.7, marginBottom: 32, fontStyle: 'italic' }}>
            {deathTip}
          </span>
          <button
            onClick={() => {
              socket.send(JSON.stringify({ type: 'respawn' } satisfies RespawnMessage))
              setIsDead(false)
              const scene = phaserGame?.scene.getScene('GameScene') as GameScene
              setKillFeed([])
            }}
            style={{
              padding: '11px 44px',
              fontSize: 13,
              background: 'rgba(121, 178, 247, 0.1)',
              color: '#e1f958',
              border: '1px solid rgba(206, 216, 86, 0.35)',
              borderRadius: 8,
              cursor: 'pointer',
              letterSpacing: 2,
              textTransform: 'uppercase',
              fontFamily: "'Share Tech', monospace",
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(121, 178, 247, 0.3)'
              e.currentTarget.style.borderColor = 'rgba(238, 250, 102, 0.6)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(121, 178, 247, 0.1)'
              e.currentTarget.style.borderColor = 'rgba(238, 250, 102, 0.35)'
            }}
          >
            play again
          </button>
        </div>
      )}
      </>}
    </div>
  )
}