import Phaser from 'phaser'
import socket, { addSocketListener, getLocalId } from '../network/socket'
import { PlayerState, SquareState } from '../../../protocol/types'
import { ServerMessage } from '../../../protocol/messages'
import { WORLD_WIDTH, WORLD_HEIGHT, COLOR_BACKGROUND, COLOR_OUTER_BOUNDS, WORLD_PADDING, SQUARE_BASE_HP, PLAYER_BASE_HP } from '../../../protocol/constants'
import { currentLevel, xpForLevel, xpThisLevel, xpForNextLevel } from '../../../protocol/utils'

export class GameScene extends Phaser.Scene {
  private playerStatBars!: Phaser.GameObjects.Graphics
  private xpLabel!: Phaser.GameObjects.Text // shows current level
  private xpMaxLabel!: Phaser.GameObjects.Text // says MAX after xp bar. only shows when at max level
  private xpMaxBg!: Phaser.GameObjects.Graphics // background rounded rectangles for labels to be more visible
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private localId: number | null = null
  private latestPlayersState: Map<number, PlayerState> = new Map()
  private latestSquaresState: Map<number, SquareState> = new Map()
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

    // initialize stat bar graphics
    this.playerStatBars = this.add.graphics()
    this.playerStatBars.setScrollFactor(0)
    this.playerStatBars.setDepth(80)

    // add xp labels
    this.xpLabel = this.add.text(18, 23, 'LVL 1', { fontSize: '12px', color: '#ffffff' })
      .setScrollFactor(0).setDepth(81)
    this.xpMaxLabel = this.add.text(280, 23, 'MAX', { fontSize: '12px', color: '#ffdd00' })
      .setScrollFactor(0).setDepth(81).setVisible(false)
    this.xpMaxBg = this.add.graphics().setScrollFactor(0).setDepth(80)
    this.xpMaxBg.fillStyle(0x444444)
    this.xpMaxBg.fillRoundedRect(273, 21, 36, 18, 4)
    this.xpMaxBg.setVisible(false)

    this.squareHealthBarGraphics = this.add.graphics()
    this.squareHealthBarGraphics.setDepth(20)

    // initialize graphics
    this.playerGraphics = this.add.graphics()
    this.playerGraphics.setDepth(99)
    this.enemyGraphics = this.add.graphics()
    this.enemyGraphics.setDepth(50)
    this.squareGraphics = this.add.graphics()
    this.squareGraphics.setDepth(15)

    // Register keys — Phaser cleans these up when the scene stops
    this.keys = {
      W: this.input.keyboard!.addKey('W'),
      A: this.input.keyboard!.addKey('A'),
      S: this.input.keyboard!.addKey('S'),
      D: this.input.keyboard!.addKey('D'),
    }

    // Subscribe to messages from the server
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data) as ServerMessage

      // Store the latest state for rendering in update()
      if (msg.type === 'world_state') {

        // replace player list with newest update from server
        this.latestPlayersState.clear()
        for (const p of msg.players) {
          this.latestPlayersState.set(p.id, {
            id: p.id,
            name: p.name,
            xp: p.xp,
            alive: p.alive,
            shieldActive: p.shieldActive,
            x: p.x,
            y: p.y,
            rotation: p.rotation,
            hp: p.hp,
            maxHp: p.maxHp,
            playerRadius: p.playerRadius,
            drillType: p.drillType,
            drillDmgMultiplier: p.drillDmgMultiplier,
            drillLengthMultiplier: p.drillLengthMultiplier
          })
        }

        // replace squares list with newest from server
        this.latestSquaresState.clear()
        for (const square of msg.squares) {
          this.latestSquaresState.set(square.id, {
            id: square.id,
            x: square.x,
            y: square.y,
            hp: square.hp,
            maxHp: square.maxHp,
            rotation: square.rotation
          })
        }
      }
    }
    addSocketListener(handler)

    // Send input to server every tick
    setInterval(() => {
      if (getLocalId() === null) return
      const dx = (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0)
      const dy = (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0)
      const pointer = this.input.activePointer
      const localId = getLocalId()
      if (localId === null) return
      const localPlayer = this.latestPlayersState.get(localId)
      let rotation = 0
      if (localPlayer != null) {
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

  // Only rendering, game logic is on server side
  update() {
    if (getLocalId() === null) return // no id assigned yet -> do nothing

    const localId = getLocalId()
    if (localId === null) return
    const playerState = this.latestPlayersState.get(localId)
    this.playerGraphics.clear()
    this.playerStatBars.clear()
    if (playerState) {
      this.showHud()
      this.cameraTarget.x = playerState.x
      this.cameraTarget.y = playerState.y
      this.playerGraphics.save()
      this.playerGraphics.translateCanvas(playerState.x, playerState.y)
      this.playerGraphics.rotateCanvas(playerState.rotation)
      if (playerState.shieldActive) {
        const alpha = 0.2 + 0.15 * Math.sin(Date.now() / 150)
        this.playerGraphics.fillStyle(0x2e79ff, alpha)
        this.playerGraphics.fillCircle(0, 0, playerState.playerRadius * 2.8)
      }
      this.playerGraphics.fillStyle(0x00ff99)
      this.playerGraphics.fillCircle(0, 0, playerState.playerRadius - 3)
      this.playerGraphics.lineStyle(2, 0x00aa66, 1)
      this.playerGraphics.strokeCircle(0, 0, playerState.playerRadius)
      drawDrill(this.playerGraphics, playerState, 0x00cc77)

      this.playerGraphics.restore()
      
      // player healthbar
      if (playerState.hp < playerState.maxHp) {
        const ratio = Math.max(0, playerState.hp / playerState.maxHp)
        const bw = 40
        const bh = 5
        this.playerGraphics.fillStyle(0x555555)
        this.playerGraphics.fillRect(playerState.x - bw / 2, playerState.y - playerState.playerRadius - 12, bw, bh)
        this.playerGraphics.fillStyle(getHealthColor(ratio))
        this.playerGraphics.fillRect(playerState.x - bw / 2, playerState.y - playerState.playerRadius - 12, ratio * bw, bh)
      }

      // update player's xp bar
      const xpRatio = Math.max(0, xpThisLevel(playerState.xp) / xpForNextLevel(playerState.xp))
      this.playerStatBars.fillStyle(0x333333)
      this.playerStatBars.fillRect(70, 24, 200, 12)
      this.playerStatBars.fillStyle(0xffdd00)
      this.playerStatBars.fillRect(70, 24, xpRatio * 200, 10)

      this.xpLabel.setText(`LVL ${currentLevel(playerState.xp) + 1}`) // update LVL label
      if (currentLevel(playerState.xp) >= 7-1) { this.xpMaxBg.setVisible(true); this.xpMaxLabel.setVisible(true) } // TODO: replace hardcoded max level with DB account level cap
    } else {
      this.hideHud()
    }

    // Update enemies
    this.enemyGraphics.clear()
    for (const [id, p] of this.latestPlayersState.entries()) {
      if (id === getLocalId()) continue

      this.enemyGraphics.save()
      this.enemyGraphics.translateCanvas(p.x, p.y)
      this.enemyGraphics.rotateCanvas(p.rotation)

      // spawn shield
      if (p.shieldActive) {
        const alpha = 0.2 + 0.15 * Math.sin(Date.now() / 150)
        this.enemyGraphics.fillStyle(0x2e79ff, alpha)
        this.enemyGraphics.fillCircle(0, 0, p.playerRadius * 2.8)
      }

      // body
      this.enemyGraphics.fillStyle(0xff6b6b)
      this.enemyGraphics.fillCircle(0, 0, p.playerRadius)
      this.enemyGraphics.lineStyle(6 + (p.playerRadius * 0.1), 0xcc4444, 1)
      this.enemyGraphics.strokeCircle(0, 0, p.playerRadius - 2)

      // weapon — starts at edge of circle
      drawDrill(this.enemyGraphics, p, 0xff4444)

      this.enemyGraphics.restore()

      // enemy healthbar
      if (p.hp < p.maxHp) {
        const ratio = Math.max(0, p.hp / p.maxHp)
        const bw = 40
        const bh = 5
        this.enemyGraphics.fillStyle(0x555555)
        this.enemyGraphics.fillRect(p.x - bw / 2, p.y - p.playerRadius - 12, bw, bh)
        this.enemyGraphics.fillStyle(getHealthColor(ratio))
        this.enemyGraphics.fillRect(p.x - bw / 2, p.y - p.playerRadius - 12, ratio * bw, bh)
      }
    }

    // update objects' healthbars
    this.squareHealthBarGraphics.clear()
    for (const [id, sq] of this.latestSquaresState.entries()) {
      if (sq.hp >= sq.maxHp) continue
      const ratio = Math.max(0, sq.hp / sq.maxHp)
      const size = 20 + (sq.maxHp / SQUARE_BASE_HP) * 10
      const bw = 15 + 8 * sq.maxHp / SQUARE_BASE_HP, bh = 4 + 1 * sq.maxHp / SQUARE_BASE_HP
      this.squareHealthBarGraphics.fillStyle(0x555555)
      this.squareHealthBarGraphics.fillRect(sq.x - bw / 2, sq.y + size / 2 + 8, bw, bh)
      this.squareHealthBarGraphics.fillStyle(getHealthColor(ratio))
      this.squareHealthBarGraphics.fillRect(sq.x - bw / 2, sq.y + size / 2 + 8, ratio * bw, bh)
    }

    this.squareGraphics.clear()
    for (const [id, sq] of this.latestSquaresState.entries()) {
      const size = 20 + (sq.maxHp / SQUARE_BASE_HP) * 10

      this.squareGraphics.save()
      this.squareGraphics.translateCanvas(sq.x, sq.y)
      this.squareGraphics.rotateCanvas(sq.rotation)
      this.squareGraphics.fillStyle(0xf5a623)
      this.squareGraphics.fillRect(-size / 2, -size / 2, size, size)
      this.squareGraphics.lineStyle(5 + (sq.maxHp / SQUARE_BASE_HP), 0xc47a0a, 1)
      this.squareGraphics.strokeRect(-size / 2, -size / 2, size, size)
      this.squareGraphics.restore()
    }
  }

  showHud() {
    this.xpLabel.setVisible(true)
    this.playerStatBars.setVisible(true)
  }

  hideHud() {
    this.xpLabel.setVisible(false)
    this.playerStatBars.setVisible(false)
    this.xpMaxLabel.setVisible(false)
    this.xpMaxBg.setVisible(false)
  }
}

function getHealthColor(ratio: number): number {
  if (ratio > 0.6) return 0x00ff99
  if (ratio > 0.3) return 0xffaa00
  return 0xff3333
}

function drawDrill(g: Phaser.GameObjects.Graphics, p: PlayerState, color: number) {
  const drillType = p.drillType
  switch (drillType) {
    case 0: drawStackedTrianglesDrill(g, p, color); break
    case 1: drawSingleTriangleDrill(g, p, color); break
  }
}

function drawStackedTrianglesDrill(g: Phaser.GameObjects.Graphics, p: PlayerState, color: number) {
  const totalLength = 40 * p.drillLengthMultiplier
  const startX = p.playerRadius // edge of player circle
  const count = Math.floor(totalLength / 6)
  const segmentLength = totalLength / count
  const baseWidth = 25

  // square base
  g.fillStyle(color)
  g.fillRect(startX, -baseWidth / 2, segmentLength, baseWidth)

  // stacked triangles
  for (let i = 0; i < count; i++) {
    const x = startX + i * segmentLength
    const width = 25 * (1 - i / count) // decreasing width toward tip
    g.fillStyle(color)
    g.fillTriangle(
      x - segmentLength * 0.3, -width / 2,
      x - segmentLength * 0.3, width / 2,
      x + segmentLength, 0
    )
  }
}

function drawSingleTriangleDrill(g: Phaser.GameObjects.Graphics, p: PlayerState, color: number) {
  const startX = p.playerRadius
  const width = 10
  const height = 40 * p.drillLengthMultiplier
  g.fillStyle(color)
  g.fillTriangle(
    startX, -width,
    startX, width,
    startX + height, 0
  )
}