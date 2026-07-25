import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { GameScene } from './GameScene'

export let phaserGame: Phaser.Game | null = null
let isReady = false
const readyCallbacks: (() => void)[] = []

// Queues callbacks until Phaser has actually finished booting (its 'ready' event).
export function onGameReady(cb: () => void): void {
  if (isReady) { cb(); return }
  if (!readyCallbacks.includes(cb)) readyCallbacks.push(cb)
}

function markReady(): void {
  isReady = true
  for (const cb of readyCallbacks) cb()
  readyCallbacks.length = 0
}

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {

  requestAnimationFrame(() => {
    phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      backgroundColor: '#1a1a2e',
      scene: [GameScene],
      parent: containerRef.current!,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: {
        keyboard: {
          capture: []
        }
      },
    })

    phaserGame.events.once('ready', () => {
      phaserGame?.scale.refresh()
      markReady()
    })
  })

  return () => {
    phaserGame?.destroy(true)
    isReady = false
    readyCallbacks.length = 0
  }
}, [])

  return <div ref={containerRef} style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }} />
}