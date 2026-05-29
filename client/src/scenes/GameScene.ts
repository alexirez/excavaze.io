import Phaser from 'phaser'
import socket from '../network/socket'
import { PlayerState, SquareState } from '../../../protocol/types'
import { ServerMessage } from '../../../protocol/messages'
import { WORLD_WIDTH, WORLD_HEIGHT, COLOR_BACKGROUND, COLOR_OUTER_BOUNDS, WORLD_PADDING } from '../../../protocol/constants'

export class GameScene extends Phaser.Scene {
  private container!: Phaser.GameObjects.Container
  private healthBar!: Phaser.GameObjects.Graphics
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private localId: string | null = null
  private latestPlayersState: Record<string, PlayerState> = {}
  private latestSquaresState: Record<string, SquareState> = {}
  private squareRotations: Map<string, number> = new Map()
  private squareSprites: Map<string, Phaser.GameObjects.Rectangle> = new Map()
  private squareHealthBars: Map<string, Phaser.GameObjects.Graphics> = new Map()

  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    // this rectangle acts as the background of in-bounds area
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH - WORLD_PADDING * 2.5, WORLD_HEIGHT - WORLD_PADDING * 2.5, COLOR_BACKGROUND).setDepth(-1)
    
    // Build the player visuals — container keeps circle and barrel together
    const circle = this.add.circle(0, 0, 25, 0x00ff99)
    const barrel = this.add.rectangle(35, 0, 40, 14, 0x00cc77)
    this.container = this.add.container(400, 300, [barrel, circle])

    this.cameras.main.setBackgroundColor(COLOR_OUTER_BOUNDS)
    this.cameras.main.startFollow(this.container)
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    // Add a healthbar
    this.healthBar = this.add.graphics()
    this.healthBar.setScrollFactor(0)

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
            id: player.id,
            x: player.x,
            y: player.y,
            rotation: player.rotation,
            hp: player.hp,
            maxHp: player.maxHp,
          }
        }

        // For rendering squares
        for (const square of msg.squares) {
          this.latestSquaresState[square.id] = {
            id: square.id,
            x: square.x,
            y: square.y,
            hp: square.hp,
            maxHp: square.maxHp,
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
      
      // update healthbar
      const ratio = playerState.hp / playerState.maxHp
      this.healthBar.clear()
      this.healthBar.fillStyle(0x555555)
      this.healthBar.fillRect(20, 20, 200, 12)
      this.healthBar.fillStyle(getHealthColor(ratio))
      this.healthBar.fillRect(20, 20, ratio * 200, 12)
    }

    const liveIds = new Set(Object.keys(this.latestSquaresState))

    for (const [id, sq] of Object.entries(this.latestSquaresState)) {
      let sprite = this.squareSprites.get(id)
      if (!sprite) {
        sprite = this.add.rectangle(sq.x, sq.y, 30, 30, 0xf5a623)
        this.squareSprites.set(id, sprite)
        this.squareRotations.set(id, (Math.random() - 0.5) * 0.02)
        this.squareHealthBars.set(id, this.add.graphics())
      }
      sprite.x = sq.x
      sprite.y = sq.y
      sprite.rotation += this.squareRotations.get(id)!

      const bar = this.squareHealthBars.get(id)!
      const ratio = sq.hp / sq.maxHp
      const bw = 30
      const bh = 4
      bar.clear()
      bar.fillStyle(0x555555)
      bar.fillRect(sq.x - bw / 2, sq.y + 20, bw, bh)
      bar.fillStyle(getHealthColor(ratio))
      bar.fillRect(sq.x - bw / 2, sq.y + 20, ratio * bw, bh)
    }

    // Cleanup for destroyed sprites
    for (const [id, sprite] of this.squareSprites) {
      if (!liveIds.has(id)) {
        sprite.destroy()
        this.squareSprites.delete(id)
        delete this.latestSquaresState[id]
        this.squareHealthBars.get(id)!.destroy()
        this.squareHealthBars.delete(id)
      }
    }
  }
}

function getHealthColor(ratio: number): number {
  if (ratio > 0.6) return 0x00ff99
  if (ratio > 0.3) return 0xffaa00
  return 0xff3333
}