import Phaser from 'phaser'
import socket from '../network/socket'
import { PlayerState, SquareState } from '../../../protocol/types'
import { ServerMessage } from '../../../protocol/messages'
import { TICK_MS, WORLD_WIDTH, WORLD_HEIGHT, COLOR_BACKGROUND, COLOR_OUTER_BOUNDS, WORLD_PADDING, SQUARE_BASE_HP } from '../../../protocol/constants'

export class GameScene extends Phaser.Scene {
  private container!: Phaser.GameObjects.Container
  private playerHealthBar!: Phaser.GameObjects.Graphics
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private localId: string | null = null
  private latestPlayersState: Record<string, PlayerState> = {}
  private latestSquaresState: Record<string, SquareState> = {}
  private squareRotations: Map<string, number> = new Map()
  private squareGraphics!: Phaser.GameObjects.Graphics
  private squareHealthBarGraphics!: Phaser.GameObjects.Graphics

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
    this.container.setDepth(99)

    this.cameras.main.setBackgroundColor(COLOR_OUTER_BOUNDS)
    this.cameras.main.startFollow(this.container)
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    this.playerHealthBar = this.add.graphics()
    this.playerHealthBar.setScrollFactor(0)
    this.playerHealthBar.setDepth(80)

    this.squareHealthBarGraphics = this.add.graphics()
    this.squareHealthBarGraphics.setDepth(10)

    this.squareGraphics = this.add.graphics()
    this.squareGraphics.setDepth(20)

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

        // replace player list with newest update from server
        this.latestPlayersState = {}
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

        // replace squares list with newest from server
        this.latestSquaresState = {}
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
      
      // update player's healthbar
      const ratio = Math.max(0, playerState.hp / playerState.maxHp)
      this.playerHealthBar.clear()
      this.playerHealthBar.fillStyle(0x555555)
      this.playerHealthBar.fillRect(20, 20, 200, 12)
      this.playerHealthBar.fillStyle(getHealthColor(ratio))
      this.playerHealthBar.fillRect(20, 20, ratio * 200, 12)
    }

    // update objects' healthbars
    this.squareHealthBarGraphics.clear()
    for (const [id, sq] of Object.entries(this.latestSquaresState)) {
      if (sq.hp >= sq.maxHp) continue
      const ratio = Math.max(0, sq.hp / sq.maxHp)
      const bw = 40, bh = 4
      this.squareHealthBarGraphics.fillStyle(0x555555)
      this.squareHealthBarGraphics.fillRect(sq.x - bw / 2, sq.y + 30, bw, bh)
      this.squareHealthBarGraphics.fillStyle(getHealthColor(ratio))
      this.squareHealthBarGraphics.fillRect(sq.x - bw / 2, sq.y + 30, ratio * bw, bh)
    }

    this.squareGraphics.clear()
    for (const [id, sq] of Object.entries(this.latestSquaresState)) {
      const rotation = this.squareRotations.get(id) ?? 0
      const size = 20 + (sq.maxHp / SQUARE_BASE_HP) * 10

      this.squareGraphics.save()
      this.squareGraphics.translateCanvas(sq.x, sq.y)
      this.squareGraphics.rotateCanvas(rotation)
      this.squareGraphics.fillStyle(0xf5a623)
      this.squareGraphics.fillRect(-size / 2, -size / 2, size, size)
      this.squareGraphics.restore()

      // update rotation for next frame
      this.squareRotations.set(id, rotation + 0.01)
    }

    for (const id of this.squareRotations.keys()) {
      if (!this.latestSquaresState[id]) {
        this.squareRotations.delete(id)
      }
    }
  }
}

function getHealthColor(ratio: number): number {
  if (ratio > 0.6) return 0x00ff99
  if (ratio > 0.3) return 0xffaa00
  return 0xff3333
}