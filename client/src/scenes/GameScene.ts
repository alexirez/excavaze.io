import Phaser from 'phaser'
import socket from '../network/socket'
import { ServerMessage } from '../../../protocol/messages'
import { WORLD_WIDTH, WORLD_HEIGHT } from '../../../protocol/constants'

export class GameScene extends Phaser.Scene {
  private container!: Phaser.GameObjects.Container
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private localId: string | null = null
  private latestPlayersState: Record<string, { x: number; y: number; rotation: number }> = {}
  private latestSquaresState: Record<string, { x: number, y: number, rotation: number }> = {}
  private squareSprites: Map<string, Phaser.GameObjects.Rectangle> = new Map()

  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    // Build the player visuals — container keeps circle and barrel together
    const circle = this.add.circle(0, 0, 25, 0x00ff99)
    const barrel = this.add.rectangle(35, 0, 40, 14, 0x00cc77)
    this.container = this.add.container(400, 300, [barrel, circle])

    this.cameras.main.startFollow(this.container)
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

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

      if (msg.type === 'welcome') {
        this.localId = msg.id
      }

      // Store the latest state for rendering in update()
      if (msg.type === 'world_state') {

        // For rendering players
        for (const player of msg.players) {
          this.latestPlayersState[player.id] = {
            x: player.x,
            y: player.y,
            rotation: player.rotation,
          }
        }

        // For rendering squares
        for (const square of msg.squares) {
          this.latestSquaresState[square.id] = {
            x: square.x,
            y: square.y,
            rotation: square.angle
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
        this.cameras.main.scrollX + pointer.x,
        this.cameras.main.scrollY + pointer.y
      )

      socket.send(JSON.stringify({ type: 'input', dx, dy, rotation }))
    }, 50)
  }

  // Only rendering, — game logic is on server side
  update() {
    if (!this.localId) return // no id assigned yet -> do nothing

    const playerState = this.latestPlayersState[this.localId]
    if (playerState) {
      this.container.x = playerState.x
      this.container.y = playerState.y
      this.container.rotation = playerState.rotation
    }

    const liveIds = new Set(Object.keys(this.latestSquaresState))

    for (const [id, sq] of Object.entries(this.latestSquaresState)) {
    let sprite = this.squareSprites.get(id)
    if (!sprite) {
      sprite = this.add.rectangle(sq.x, sq.y, 30, 30, 0xf5a623)
      this.squareSprites.set(id, sprite)
    }
    sprite.x = sq.x
    sprite.y = sq.y
    sprite.rotation = sq.rotation
    }

    // Destroy sprites for squares no longer in state
    for (const [id, sprite] of this.squareSprites) {
      if (!liveIds.has(id)) {
        sprite.destroy()
        this.squareSprites.delete(id)
      }
    }
  }
}