import { useEffect, useRef, useState } from 'react'
import { phaserGame } from '../core/PhaserGame'
import { loadOfflineUsername, saveOfflineUsername } from '../../storage/offlineStorage'
import { pickTip, stripTipPrefix, pickDifferentTip } from '../../../protocol/data/tips'
import SpeechBubble from '../components/SpeechBubble'

const shakeStyle = `
  @keyframes shake {
    0%, 100% { transform: translateX(0) }
    20% { transform: translateX(-8px) }
    40% { transform: translateX(8px) }
    60% { transform: translateX(-6px) }
    80% { transform: translateX(6px) }
  }
`

interface Props {
  onPlay: (name: string, bodyColor: number, borderColor: number) => void
  onUpgrades: () => void
  online: boolean
  setOnline: React.Dispatch<React.SetStateAction<boolean>>
  gems: number
  bodyColor: string
  setBodyColor: React.Dispatch<React.SetStateAction<string>>
  borderColor: string
  setBorderColor: React.Dispatch<React.SetStateAction<string>>
}

const ONLINE_SERVER_URL = 'wss://excavaze.io'
const LOCAL_SERVER_URL = 'wss://localhost:3000'

export default function StartMenu({ onPlay, onUpgrades, online, setOnline, gems, bodyColor, setBodyColor, borderColor, setBorderColor }: Props) {
  const [name, setName] = useState('')
  const [tip, setTip] = useState(() => pickTip('general'))
  const [tipVisible, setTipVisible] = useState(true)
  const [tipSpacing, setTipSpacing] = useState(1)
  const [tipTransition, setTipTransition] = useState<'ease-in' | 'ease-out'>('ease-out')
  const [showStarConfirm, setShowStarConfirm] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [nameError, setNameError] = useState(false)
  const shakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const brushButtonRef = useRef<HTMLButtonElement>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)

  useEffect(() => {
    phaserGame?.input.keyboard?.clearCaptures()
    nameInputRef.current?.focus()

    loadOfflineUsername()
      .then(username => { if (username) setName(username) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setTipTransition('ease-in')
      setTipVisible(false)
      setTipSpacing(4)  // spread out as it shrinks
      setTimeout(() => {
        setTip(current => pickDifferentTip('general', current))
        setTipTransition('ease-out')
        setTipVisible(true)
        setTipSpacing(1)
      }, 200)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const persistName = () => {
    const trimmed = name.trim()
    if (trimmed) saveOfflineUsername(trimmed).catch(() => {})
  }

  const handlePlay = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      nameInputRef.current?.focus()
      if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current)
      setNameError(true)
      shakeTimeoutRef.current = setTimeout(() => setNameError(false), 3500)
      return
    }
    persistName()
    onPlay(trimmed, parseInt(bodyColor.slice(1), 16), parseInt(borderColor.slice(1), 16))
  }

  const handleUpgrades = () => {
    persistName()
    onUpgrades()
  }

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(14,14,20,0.85)',
      fontFamily: "'Share Tech', monospace",
    }}>
    <style>{shakeStyle}</style>

      {/* star confirmation popup */}
      {showStarConfirm && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10,
        }}>
          <div style={{
            background: 'rgba(20,20,28,0.98)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            padding: '32px 36px',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 16, maxWidth: 280, textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
              This will open github.com so you can star the repository. Your support is appreciated!
            </div>
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <button
                onClick={() => setShowStarConfirm(false)}
                style={{
                  flex: 1, padding: '10px', background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.45)', border: '0.5px solid rgba(255,255,255,0.12)',
                  borderRadius: 7, cursor: 'pointer', fontFamily: "'Share Tech', monospace",
                  fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.2)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                }}
              >
                cancel
              </button>
              <button
                onClick={() => { window.open('https://github.com/alxdrrm/excavaze.io', '_blank'); setShowStarConfirm(false) }}
                style={{
                  flex: 1, padding: '10px', background: 'rgba(255,221,0,0.08)',
                  color: '#ffdd00', border: '1px solid rgba(255,221,0,0.3)',
                  borderRadius: 7, cursor: 'pointer', fontFamily: "'Share Tech', monospace",
                  fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,221,0,0.2)'
                  e.currentTarget.style.borderColor = 'rgba(255,221,0,0.6)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,221,0,0.08)'
                  e.currentTarget.style.borderColor = 'rgba(255,221,0,0.3)'
                }}
              >
                ★ star
              </button>
            </div>
          </div>
        </div>
      )}

      {/* online toggle — top right */}
      <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
            color: online ? 'rgba(0,255,153,0.8)' : 'rgba(255,255,255,0.35)',
          }}>
            {online ? 'online' : 'offline'}
          </span>
          <div
            onClick={() => setOnline(o => !o)}
            style={{
              width: 36, height: 20, borderRadius: 99, cursor: 'pointer', position: 'relative',
              background: online ? 'rgba(0,255,153,0.25)' : 'rgba(255,255,255,0.1)',
              border: online ? '0.5px solid rgba(0,255,153,0.5)' : '0.5px solid rgba(255,255,255,0.2)',
              transition: 'background 0.2s, border-color 0.2s',
            }}
          >
            <div style={{
              width: 14, height: 14, borderRadius: '50%', position: 'absolute', top: 2,
              left: online ? 18 : 2,
              background: online ? '#00ff99' : 'rgba(255,255,255,0.35)',
              transition: 'left 0.2s, background 0.2s',
            }} />
          </div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
          borderRadius: 6, padding: '6px 12px',
          opacity: online ? 1 : 0.4, transition: 'opacity 0.2s',
        }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', letterSpacing: 1 }}>
            {online ? ONLINE_SERVER_URL : LOCAL_SERVER_URL}
          </span>
        </div>
      </div>

      {/* main content */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 360 }}>

        {/* title */}
        <div style={{ fontSize: 64, color: 'white', letterSpacing: 2, lineHeight: 1, marginBottom: 48 }}>
          excavaze<span style={{ color: '#ffdd00', opacity: 0.7 }}>.io</span>
        </div>

        {/* name input + play */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>
            your name
          </div>
          <input
            ref={nameInputRef}
            type="text"
            placeholder="enter name..."
            maxLength={16}
            value={name}
            onChange={e => {
              setName(e.target.value)
              if (nameError) {
                if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current)
                setNameError(false)
              }
            }}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter') handlePlay()
            }}
            onKeyUp={e => e.stopPropagation()}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.35)',
              borderRadius: 8, padding: '12px 16px', fontSize: 16, color: 'white',
              fontFamily: "'Share Tech', monospace", outline: 'none',
              animation: nameError ? 'shake 0.5s ease' : 'none',
              borderColor: nameError ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.15)',
            }}
            onFocus={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.borderColor = nameError ? 'rgba(255,100,100,0.6)' : 'rgba(255,255,255,0.4)'
              phaserGame?.input.keyboard?.clearCaptures()
            }}
            onBlur={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.borderColor = nameError ? 'rgba(255,100,100,0.6)' :  'rgba(255,255,255,0.35)'
            }}
          />
          {nameError && (
            <div style={{ fontSize: 11, color: 'rgba(255,100,100,0.8)', letterSpacing: 1, marginTop: -4 }}>
              please enter a name
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <button
            onClick={handlePlay}
            style={{
              width: '100%', padding: '13px', fontSize: 14,
              background: 'rgba(0,255,153,0.10)', color: '#00ff99',
              border: '1px solid rgba(0,255,153,0.35)', borderRadius: 8,
              cursor: 'pointer', letterSpacing: 3, textTransform: 'uppercase',
              fontFamily: "'Share Tech', monospace", transition: 'background 0.15s, border-color 0.15s',
              marginTop: 2,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(0,255,153,0.18)'
              e.currentTarget.style.borderColor = 'rgba(0,255,153,0.6)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(0,255,153,0.10)'
              e.currentTarget.style.borderColor = 'rgba(0,255,153,0.4)'
            }}
          >
            play
          </button>

          {/* SpeechBubble color poopup */}
          <button
            ref={brushButtonRef}
            onClick={() => setShowColorPicker(v => !v)}
            aria-label="customize colors"
            style={{ width: 48, height: 48, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.75)' }}
          >
            🖌️
          </button>

          <SpeechBubble anchorRef={brushButtonRef} open={showColorPicker} onClose={() => setShowColorPicker(false)}>
            <div style={{ display: 'flex', gap: 24, padding: '18px 20px 16px', fontFamily: "'Share Tech', monospace" }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 10, letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>body color</div>
                <input type="color" value={bodyColor} onChange={e => setBodyColor(e.target.value)} style={{ width: 40, height: 40, border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: 0, background: 'none' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 10, letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>border color</div>
                <input type="color" value={borderColor} onChange={e => setBorderColor(e.target.value)} style={{ width: 40, height: 40, border: '0.5px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: 0, background: 'none' }} />
              </div>
            </div>
          </SpeechBubble>
          </div>
        </div>

        {/* tip panel */}
        <div style={{
          width: '100%', boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)',
          borderRadius: 8, padding: '14px 16px', marginBottom: 10,
        }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 6 }}>
            tip
          </div>
          <div style={{
            fontSize: tipVisible ? 12 : 4,
            color: 'rgba(255,255,255,0.55)', 
            minHeight: 40,
            lineHeight: 1.7, 
            letterSpacing: tipSpacing,
            transition: `font-size 0.2s ${tipTransition}, letter-spacing 0.2s ${tipTransition}`,
            }}>
            {stripTipPrefix(tip)}
          </div>
        </div>

        {/* upgrades + controls panels */}
        <div style={{ width: '100%', display: 'flex', gap: 8, marginBottom: 10 }}>
          <div
            onClick={handleUpgrades}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,221,0,0.2)'
              e.currentTarget.style.borderColor = 'rgba(255,221,0,0.2)'
              e.currentTarget.style.cursor = 'pointer'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,221,0,0.09)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
            }}
            style={{
              flex: 1, background: 'rgba(255,221,0,0.09)', border: '0.5px solid rgba(255,255,255,0.07)',
              borderRadius: 8, padding: '14px 16px', transition: 'background 0.15s, border-color 0.15s',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,221,0,0.72)', textTransform: 'uppercase', marginBottom: 6 }}>upgrades</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>Unlock permanent upgrades here with gems.</div>
          </div>
          <div style={{
            flex: 1, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)',
            borderRadius: 8, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 6 }}>controls</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>Movement: WASD<br />Aim with the cursor</div>
          </div>
        </div>

        {/* bottom row: gems + github star */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div id="gems-display-anchor" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.05)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '2px 14px 2px 4px',
              minWidth: 130,
            }}>
            <img src="/assets/purchase-plus-button.svg" alt="gems" style={{ width: 30, height: 30 }} />
            <img src="/assets/gem.svg" alt="gems" style={{ width: 30, height: 30 }} />
            <span style={{
              fontSize: 13, color: 'rgba(255,255,255,0.55)',
              fontFamily: "'Share Tech', monospace", letterSpacing: 1,
            }}>
              {gems}
            </span>
            </div>
          </div>
          <button
            onClick={() => setShowStarConfirm(true)}
            style={{
              background: 'none', border: '0.5px solid rgba(255,255,255,0.45)',
              borderRadius: 7, padding: '7px 14px', cursor: 'pointer',
              fontFamily: "'Share Tech', monospace", fontSize: 13,
              color: 'rgba(255,255,255,0.5)', letterSpacing: 1,
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = 'rgba(255, 221, 0, 0.8)'
              e.currentTarget.style.borderColor = 'rgba(255,221,0,0.6)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.45)'
            }}
          >
            ★ star on github
          </button>
        </div>
      </div>
    </div>
  )
}