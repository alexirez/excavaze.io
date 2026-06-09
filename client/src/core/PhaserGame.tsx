import React, { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { GameScene } from '../scenes/GameScene'

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#1a1a2e',
      scene: [GameScene],
      parent: containerRef.current!,
    })

    return () => game.destroy(true)
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}