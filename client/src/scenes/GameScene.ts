import Phaser from 'phaser'
import socket from '../network/socket'
import { ServerMessage } from '../../../protocol/messages'

export class GameScene extends Phaser.Scene {
  private container!: Phaser.GameObjects.Container
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private localId: string | null = null
  private latestState: Record<string, { x: number; y: number; rotation: number }> = {}

  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    // Build the player visuals — container keeps circle and barrel together
    const circle = this.add.circle(0, 0, 25, 0x00ff99)
    const barrel = this.add.rectangle(35, 0, 40, 14, 0x00cc77)
    this.container = this.add.container(400, 300, [barrel, circle])

    // Register keys — Phaser cleans these up when the scene stops
    this.keys = {
      W: this.input.keyboard!.addKey('W'),
      A: this.input.keyboard!.addKey('A'),
      S: this.input.keyboard!.addKey('S'),
      D: this.input.keyboard!.addKey('D'),
    }

    // Subscribe to messages from the server
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ServerMessage

      if (msg.type === 'world_state') {
        // Store the latest state for rendering in update()
        for (const player of msg.players) {
          this.latestState[player.id] = {
            x: player.x,
            y: player.y,
            rotation: player.rotation,
          }
        }
      }
    }

    // Send input to server every tick
    setInterval(() => {
      const dx = (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0)
      const dy = (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0)
      const pointer = this.input.activePointer
      const rotation = Phaser.Math.Angle.Between(
        this.container.x, this.container.y,
        pointer.x, pointer.y
      )

      socket.send(JSON.stringify({ type: 'input', dx, dy, rotation }))
    }, 50)
  }

  update() {
    // Only render — no movement logic here
    if (!this.localId) return

    const state = this.latestState[this.localId]
    if (!state) return

    this.container.x = state.x
    this.container.y = state.y
    this.container.rotation = state.rotation
  }
}