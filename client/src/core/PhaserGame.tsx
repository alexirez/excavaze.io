import React, { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { GameScene } from '../scenes/GameScene'

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
  let game: Phaser.Game

  requestAnimationFrame(() => {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      backgroundColor: '#1a1a2e',
      scene: [GameScene],
      parent: containerRef.current!,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: '100%',
        height: '100%',
      },
    })
  })

  return () => game?.destroy(true)
}, [])

  return <div ref={containerRef} style={{ width: '100vw', height: '100vh' }} />
}