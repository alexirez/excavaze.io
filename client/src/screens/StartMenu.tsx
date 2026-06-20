import React, { useRef, useState } from 'react'
import { phaserGame } from '../core/PhaserGame'

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
  onPlay: (name: string) => void
}

const ONLINE_SERVER_URL = 'wss://excavaze.io'
const LOCAL_SERVER_URL = 'localhost:3000'

export default function StartMenu({ onPlay }: Props) {
  const [name, setName] = useState('')
  const [online, setOnline] = useState(false)
  const [showStarConfirm, setShowStarConfirm] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [nameError, setNameError] = useState(false)
  const shakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
                onClick={() => { window.open('https://github.com/alexirez/excavaze.io', '_blank'); setShowStarConfirm(false) }}
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
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onPlay(name.trim()) }}
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
          <button
            onClick={() => {
              if (!name.trim()) {
                nameInputRef.current?.focus()
                setNameError(true)
                if (shakeTimeoutRef.current) clearTimeout(shakeTimeoutRef.current)
                setNameError(true)
                shakeTimeoutRef.current = setTimeout(() => setNameError(false), 3500)
                return
              }
              onPlay(name.trim())
            }}
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
        </div>

        {/* tip panel */}
        <div style={{
          width: '100%', boxSizing: 'border-box',
          background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)',
          borderRadius: 8, padding: '14px 16px', marginBottom: 10,
        }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 6 }}>tip</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
            Avoid large players — their drills deal significantly more damage.
          </div>
        </div>

        {/* upgrades + controls panels */}
        <div style={{ width: '100%', display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{
            flex: 1, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)',
            borderRadius: 8, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,221,0,0.72)', textTransform: 'uppercase', marginBottom: 6 }}>upgrades</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>Unlock permanent upgrades here with diamonds.</div>
          </div>
          <div style={{
            flex: 1, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)',
            borderRadius: 8, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 6 }}>controls</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>Movement: WASD<br />Aim with the cursor</div>
          </div>
        </div>

        {/* star button */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
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