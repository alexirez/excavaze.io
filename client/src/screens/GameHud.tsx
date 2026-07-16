import { useState, useEffect, useRef } from 'react'
import { socket, addSocketListener, getLocalId } from '../network/socket'
import { ServerMessage } from '../../../protocol/messages'
import { currentLevel, xpForNextLevel, xpThisLevel } from '../../../protocol/utils'
import { PERK_TREE, RARITY_CONFIG } from '../../../protocol/data/perks'
import { pickTip } from '../../../protocol/data/tips'
import { CLIENT_QUEST_GETTERS, clientPlayers } from '../clientState'
import { ClientPlayer, DisplayQuest } from '../entities'
import { QUEST_TEMPLATE_MAP } from '../../../protocol/data/quests'
import { gemsOverlayHandle } from '../components/GemsOverlay'

interface KillFeedEntry {
  id: number
  victimId: number
  killerId?: number
  killerName?: string
  victimName: string
  exiting: boolean
}

function formatXp(xp: number): string {
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(3)}m`
  if (xp >= 10_000) return `${(xp / 1_000).toFixed(1)}k`
  if (xp >= 1_000) return `${(xp / 1_000).toFixed(2)}k`
  return `${xp.toFixed(0)}`
}

type Screen = 'startMenu' | 'game' | 'upgrades'

interface Props {
  screen: Screen
  playerName: string
  isDead: boolean
  purchasedUpgrades: string[]
  quests: DisplayQuest[]
  bodyColor: string
  setBodyColor: React.Dispatch<React.SetStateAction<string>>
  borderColor: string
  setBorderColor: React.Dispatch<React.SetStateAction<string>>
  setIsDead: (val: boolean) => void
  onHome: () => void
  onUpgrades: () => void
  onRespawn: () => void
  onClaimQuest: (instanceId: string) => void
}

let killFeedCounter = 0

export default function GameHud({ screen, playerName, isDead, purchasedUpgrades, quests, bodyColor, borderColor, setIsDead, onHome, onUpgrades, onRespawn, onClaimQuest }: Props) {
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([])
  const [xpRatio, setXpRatio] = useState(0)
  const [xpLevel, setXpLevel] = useState(1)
  const [xpIsMax, setXpIsMax] = useState(false)
  const [deathVisible, setDeathVisible] = useState(false)
  const [killerName, setKillerName] = useState('')
  const [deathTip, setDeathTip] = useState('')
  const [leaderboard, setLeaderboard] = useState<ClientPlayer[]>([])
  const [perkChoices, setPerkChoices] = useState<string[] | null>(null)
  const [perkVisible, setPerkVisible] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const lastPerkChoiceTime = useRef<number>(0)
  const perkChoicesRef = useRef<string[] | 'pending' | null>(null)
  const [pressedQuestId, setPressedQuestId] = useState<string | null>(null)
  const [predictedProgress, setPredictedProgress] = useState<Record<string, number>>({})
  const spawnedAtRef = useRef<number | null>(null)

  useEffect(() => {
    spawnedAtRef.current = isDead ? null : Date.now()
  }, [isDead])

  useEffect(() => {
    const interval = setInterval(() => {
    const localId = getLocalId()
    const localPlayer = localId !== null ? clientPlayers.get(localId) : undefined
    if (!localPlayer) return

    setPredictedProgress(prev => {
      const next = { ...prev }
      for (const q of quests) {
        if (q.status !== 'active') continue
        const template = QUEST_TEMPLATE_MAP.get(q.questId)
        const getValue = template && CLIENT_QUEST_GETTERS[template.event]
        if (!template || !getValue) continue
        next[q.instanceId] = Math.min(getValue(localPlayer, spawnedAtRef.current), template.target)
      }
      return next
      })
    }, 250)
    return () => clearInterval(interval)
  }, [quests])

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
        const sorted = [...clientPlayers.values()]
          .sort((a, b) => b.snapshot.xp - a.snapshot.xp)
          .slice(0, 10)
        setLeaderboard(sorted)
        const localId = getLocalId()
        const local = sorted.find(p => p.snapshot.id === localId)
        if (local) {
          const pending = Math.min(currentLevel(local.snapshot.xp), local.maxLevel) - local.collectedPerks.length
          setPendingCount(pending)
          if (pending > 0 && !perkChoicesRef.current && Date.now() > lastPerkChoiceTime.current + 500) {
            socket.send(JSON.stringify({ type: 'request_perk_choices' }))
            perkChoicesRef.current = 'pending' // prevent repeated requests
            setTimeout(() => {
              if (perkChoicesRef.current === 'pending') {
                perkChoicesRef.current = null // no response arrived in time, allow retry
              }
            }, 2000)
          }
          const displayLevel = Math.min(currentLevel(local.snapshot.xp), local.maxLevel)
          setXpLevel(displayLevel)
          displayLevel >= local.maxLevel ? setXpRatio(1) : setXpRatio(xpThisLevel(local.snapshot.xp) / xpForNextLevel(local.snapshot.xp))
          setXpIsMax(displayLevel >= local.maxLevel)
        }
      } else if (msg.type === 'player_killed') {
        // 1) add kill feed entry
        const id = killFeedCounter++
        setKillFeed(prev => [...prev, { id, victimId: msg.victimId, killerId: msg.killerId, killerName: msg.killerName, victimName: msg.victimName, exiting: false }])
        setTimeout(() => {
          setKillFeed(prev => prev.map(e => e.id === id ? { ...e, exiting: true } : e))
        }, 4500)
        setTimeout(() => {
          setKillFeed(prev => prev.filter(e => e.id !== id))
        }, 5000)

        // 2) spawn gems for player's kills and death
        if (msg.killerId === getLocalId() || msg.victimId === getLocalId()) {
          //
        }
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
      } else if (msg.type === 'perk_options') {
        setPerkChoices(msg.perkOptions)
        perkChoicesRef.current = msg.perkOptions
        requestAnimationFrame(() => setPerkVisible(true))
      }
    }
    addSocketListener(handler)
  }, [])

  const isGame = screen === 'game'

  return <>
    {/* xp bar */}
    {isGame && !isDead && (
      <div style={{
        position: 'absolute',
        top: 20,
        left: 18,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        pointerEvents: 'none',
        fontFamily: "'Share Tech', sans-serif",
        transform: isDead ? 'translateX(-200px)' : 'translateX(0)',
        opacity: isDead ? 0 : 1,
        transition: isDead ? 'transform 0.4s ease, opacity 0.4s ease' : 'none',
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
          <div style={{ background: '#444444', borderRadius: 4, padding: '1px 6px' }}>
            <span style={{ fontSize: 12, color: '#ffdd00' }}>MAX</span>
          </div>
        )}
      </div>
    )}

    {/* kill feed — game only */}
    {isGame && (
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
    )}

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
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        borderRadius: 16,
        padding: '8px 16px',
      }} />
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
                {p ? `${formatXp(p.snapshot.xp)}` : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>

    {/* Quests side panel */}
    {isGame && (
      <div style={{
        position: 'absolute',
        top: 70,
        left: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: "'Share Tech', sans-serif",
        transform: isDead ? 'translateX(-200px)' : 'translateX(0)',
        opacity: isDead ? 0 : 1,
        transition: isDead ? 'transform 0.4s ease, opacity 0.4s ease' : 'none',
        width: 220,
      }}>
        {quests.filter(q => q.status === 'active').map(q => {
          const template = QUEST_TEMPLATE_MAP.get(q.questId)
          if (!template) return null
          const progress = predictedProgress[q.instanceId] ?? q.progress
          const ready = progress >= template.target
          return (
            <div key={q.instanceId} style={{
              background: 'rgba(0,0,0,0.6)',
              borderRadius: 8,
              padding: '8px 12px',
            }}>
              <div style={{ fontSize: 12, color: 'white', marginBottom: 6 }}>{template.description}</div>
              <div style={{ width: '100%', height: 8, background: '#333333', borderRadius: 4, position: 'relative' }}>
                <div style={{
                  width: `${Math.min(100, (progress / template.target) * 100)}%`,
                  height: '100%',
                  background: ready ? '#00ff99' : '#ffdd00',
                  borderRadius: 4,
                }} />
              </div>
              {ready && (
                <button
                  onClick={e => {
                    const localId = getLocalId()
                    if (localId !== null) {
                      const count = Math.max(6, Math.min(3, template.rewardGems / 100))
                      gemsOverlayHandle?.burstGems(e.currentTarget, { id: localId }, count)
                    }
                    onClaimQuest(q.instanceId)
                  }}
                  onMouseDown={() => setPressedQuestId(q.instanceId)}
                  onMouseUp={() => setPressedQuestId(null)}
                  onMouseLeave={() => setPressedQuestId(null)}
                  style={{
                    marginTop: 6, width: '100%', padding: '4px', fontSize: 11,
                    background: 'rgba(0,255,153,0.15)', color: '#00ff99',
                    border: '1px solid rgba(0,255,153,0.4)', borderRadius: 6,
                    cursor: 'pointer', fontFamily: "'Share Tech', monospace",
                    letterSpacing: 1, textTransform: 'uppercase',
                    transform: pressedQuestId === q.instanceId ? 'scale(0.9)' : 'scale(1)',
                    transition: 'transform 0.1s ease',
                  }}
                >
                  claim
                </button>
              )}
            </div>
          )
        })}
      </div>
    )}

    {/* perk selection */}
    {isGame && perkChoices && (
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
                  setTimeout(() => setPerkChoices(null), 300)
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
    {isGame && isDead && (
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 600,
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'rgba(20,20,28,0.88)',
        border: '0.5px solid rgba(255,255,255,0.1)',
        padding: '52px 64px',
        opacity: deathVisible ? 1 : 0,
        transform: deathVisible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.5)',
        transition: 'opacity 1s ease, transform 1s ease',
        pointerEvents: isDead ? 'auto' : 'none',
      }}>
        <span style={{ fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(255,100,100,1)', marginBottom: 10 }}>
          eliminated
        </span>
        <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
          you were killed by
        </span>
        <span style={{ fontSize: 52, color: 'rgba(255,100,100,1)', letterSpacing: 1, marginBottom: 28 }}>
          {killerName}
        </span>
        <div style={{ width: '100%', height: 0.5, background: 'rgba(255,255,255,0.55)', marginBottom: 24 }} />
        <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.7, marginBottom: 32, fontStyle: 'italic' }}>
          {deathTip}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onHome}
            style={{
              padding: '11px 20px',
              fontSize: 13,
              background: 'rgba(53,53,50,0.25)',
              color: 'rgba(200,200,200,0.8)',
              border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: "'Share Tech', monospace",
              lineHeight: 1,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(53,53,50,0.25)'
              e.currentTarget.style.borderColor = 'rgba(200,200,200,0.6)'
              e.currentTarget.style.color = 'rgba(200,200,200,0.8)'
            }}
          >
            ✕
          </button>
          <button
            onClick={() => {
              socket.send(JSON.stringify({
                type: 'client_respawn', name: playerName, upgrades: purchasedUpgrades, 
                bodyColor: parseInt(bodyColor.slice(1), 16),
                borderColor: parseInt(borderColor.slice(1), 16), 
              }))
              setIsDead(false)
              setKillFeed([])
              onRespawn()
            }}
            style={{
              padding: '11px 44px',
              fontSize: 13,
              background: 'rgba(53,53,50,0.25)',
              color: 'rgba(200,200,200,0.8)',
              border: '1px solid rgba(200,200,200,0.6)',
              borderRadius: 8,
              cursor: 'pointer',
              letterSpacing: 2,
              textTransform: 'uppercase',
              fontFamily: "'Share Tech', monospace",
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(53,53,50,0.25)'
              e.currentTarget.style.borderColor = 'rgba(200,200,200,0.6)'
              e.currentTarget.style.color = 'rgba(200,200,200,0.8)'
            }}
          >
            play again
          </button>
          <button
            onClick={onUpgrades}
            style={{
              padding: '11px 20px',
              fontSize: 13,
              background: 'rgba(255,221,0,0.18)',
              color: 'rgb(255,221,0)',
              border: '1px solid rgba(255,221,0,0.5)',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: "'Share Tech', monospace",
              lineHeight: 1,
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,221,0,0.25)'
              e.currentTarget.style.borderColor = 'rgba(255,221,0,0.8)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,221,0,0.18)'
              e.currentTarget.style.borderColor = 'rgba(255,221,0,0.5)'
            }}
          >
            Upgrades
          </button>
        </div>
      </div>
    )}
  </>
}