import Phaser from 'phaser'
import socket from '../network/socket'
import { PlayerState, SquareState } from '../../../protocol/types'
import { ServerMessage } from '../../../protocol/messages'
import { TICK_MS, WORLD_WIDTH, WORLD_HEIGHT, COLOR_BACKGROUND, COLOR_OUTER_BOUNDS, WORLD_PADDING, SQUARE_BASE_HP } from '../../../protocol/constants'

export class GameScene extends Phaser.Scene {
  private playerHealthBar!: Phaser.GameObjects.Graphics
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private localId: string | null = null
  private latestPlayersState: Record<string, PlayerState> = {}
  private latestSquaresState: Record<string, SquareState> = {}
  private squareRotations: Map<string, number> = new Map()
  private squareGraphics!: Phaser.GameObjects.Graphics
  private squareHealthBarGraphics!: Phaser.GameObjects.Graphics
  private playerGraphics!: Phaser.GameObjects.Graphics
  private enemyGraphics!: Phaser.GameObjects.Graphics
  private cameraTarget!: Phaser.GameObjects.Rectangle

  constructor() {
    super({ key: 'GameScene' })
  }

  create() {    
    // background of in-bounds area
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH - WORLD_PADDING * 2.5, WORLD_HEIGHT - WORLD_PADDING * 2.5, COLOR_BACKGROUND).setDepth(-1)

    // background of outer bounds
    this.cameras.main.setBackgroundColor(COLOR_OUTER_BOUNDS)
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    this.cameraTarget = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 1, 1)
    this.cameraTarget.setVisible(false)
    this.cameras.main.startFollow(this.cameraTarget)

    // initialize healthbar graphics
    this.playerHealthBar = this.add.graphics()
    this.playerHealthBar.setScrollFactor(0)
    this.playerHealthBar.setDepth(80)

    this.squareHealthBarGraphics = this.add.graphics()
    this.squareHealthBarGraphics.setDepth(10)

    // initialize graphics
    this.playerGraphics = this.add.graphics()
    this.playerGraphics.setDepth(99)
    this.enemyGraphics = this.add.graphics()
    this.enemyGraphics.setDepth(50)
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
            drillParams: player.drillParams
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
      const localPlayer = this.localId ? this.latestPlayersState[this.localId] : null
      let rotation = 0
      if (localPlayer) {
        rotation = Phaser.Math.Angle.Between(
        localPlayer.x, localPlayer.y,
        this.cameras.main.scrollX + pointer.x,
        this.cameras.main.scrollY + pointer.y
        )
      } else {
        rotation = 0
      }

      socket.send(JSON.stringify({ type: 'input', dx, dy, rotation }))
    }, 50)
  }

  // Only rendering, — game logic is on server side
  update() {
    if (!this.localId) return // no id assigned yet -> do nothing

    const playerState = this.latestPlayersState[this.localId]
    if (playerState) {
      this.cameraTarget.x = playerState.x
      this.cameraTarget.y = playerState.y

      this.playerGraphics.clear()
      this.playerGraphics.fillStyle(0x00ff99)
      this.playerGraphics.save()
      this.playerGraphics.translateCanvas(playerState.x, playerState.y)
      this.playerGraphics.rotateCanvas(playerState.rotation)
      this.playerGraphics.fillCircle(0, 0, 25)
      drawDrill(this.playerGraphics, playerState.drillParams)
      this.playerGraphics.restore()
      
      // update player's healthbar
      const ratio = Math.max(0, playerState.hp / playerState.maxHp)
      this.playerHealthBar.clear()
      this.playerHealthBar.fillStyle(0x555555)
      this.playerHealthBar.fillRect(20, 20, 200, 12)
      this.playerHealthBar.fillStyle(getHealthColor(ratio))
      this.playerHealthBar.fillRect(20, 20, ratio * 200, 12)
    }

    // Update enemies
    this.enemyGraphics.clear()
    for (const [id, p] of Object.entries(this.latestPlayersState)) {
      if (id === this.localId) continue

      this.enemyGraphics.save()
      this.enemyGraphics.translateCanvas(p.x, p.y)
      this.enemyGraphics.rotateCanvas(p.rotation)

      // body
      this.enemyGraphics.fillStyle(0xff6b6b)
      this.enemyGraphics.fillCircle(0, 0, 25)

      // weapon — starts at edge of circle
      drawDrill(this.enemyGraphics, p.drillParams)

      this.enemyGraphics.restore()
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

function unpackDrillParams(drillParams: number) {
  return {
    drillType: drillParams & 0x7,
    segments: (drillParams >> 3) & 0x7,
  }
}

function drawDrill(g: Phaser.GameObjects.Graphics, drillParams: number) {
  const { drillType, segments } = unpackDrillParams(drillParams)
  switch (drillType) {
    case 0: drawStackedTrianglesDrill(g, segments || 3); break
    case 1: drawSingleTriangleDrill(g); break
  }
}

function drawStackedTrianglesDrill(g: Phaser.GameObjects.Graphics, count: number) {
  const startX = 25 // edge of player circle
  const totalLength = 40
  const segmentLength = totalLength / count
  for (let i = 0; i < count; i++) {
    const x = startX + i * segmentLength
    const width = 14 * (1 - i / count) // decreasing width toward tip
    g.fillTriangle(
      x, -width / 2,
      x, width / 2,
      x + segmentLength, 0
    )
  }
}

function drawSingleTriangleDrill(g: Phaser.GameObjects.Graphics) {
  g.fillTriangle(
    25, -7,
    25, 7,
    65, 0
  )
}