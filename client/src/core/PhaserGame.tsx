import React, { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { GameScene } from './GameScene'

export let phaserGame: Phaser.Game | null = null

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
    })
  })

  return () => phaserGame?.destroy(true)
}, [])

  return <div ref={containerRef} style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }} />
}