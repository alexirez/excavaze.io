import Phaser from 'phaser'
import socket from '../network/socket'
import { PlayerState, SquareState } from '../../../protocol/types'
import { ServerMessage } from '../../../protocol/messages'
import { WORLD_WIDTH, WORLD_HEIGHT, COLOR_BACKGROUND, COLOR_OUTER_BOUNDS, WORLD_PADDING, SQUARE_BASE_HP, PLAYER_BASE_HP } from '../../../protocol/constants'

export class GameScene extends Phaser.Scene {
  private playerHealthBar!: Phaser.GameObjects.Graphics
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

    // initialize healthbar graphics
    this.playerHealthBar = this.add.graphics()
    this.playerHealthBar.setScrollFactor(0)
    this.playerHealthBar.setDepth(80)

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
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ServerMessage

      if (msg.type === 'welcome') {
        this.localId = msg.id
      }

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
      } else if (msg.type === 'player_killed') {
        if (msg.victimId === this.localId) {
          console.log(`You were killed by ${msg.killerName}`)
        } else {
          console.log(`Player ${msg.victimId} was killed by ${msg.killerName}`)
        }
      }
    }

    // Send input to server every tick
    setInterval(() => {
      const dx = (this.keys.D.isDown ? 1 : 0) - (this.keys.A.isDown ? 1 : 0)
      const dy = (this.keys.S.isDown ? 1 : 0) - (this.keys.W.isDown ? 1 : 0)
      const pointer = this.input.activePointer
      if (this.localId === null) return
      const localPlayer = this.latestPlayersState.get(this.localId)
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
    if (this.localId === null) return // no id assigned yet -> do nothing

    const playerState = this.latestPlayersState.get(this.localId)
    if (playerState) {
      this.cameraTarget.x = playerState.x
      this.cameraTarget.y = playerState.y

      this.playerGraphics.clear()
      this.playerGraphics.fillStyle(0x00ff99)
      this.playerGraphics.save()
      this.playerGraphics.translateCanvas(playerState.x, playerState.y)
      this.playerGraphics.rotateCanvas(playerState.rotation)
      this.playerGraphics.fillCircle(0, 0, playerState.playerRadius - 3)
      this.playerGraphics.lineStyle(2, 0x00aa66, 1)
      this.playerGraphics.strokeCircle(0, 0, playerState.playerRadius)
      drawDrill(this.playerGraphics, playerState, 0x00cc77)
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
    for (const [id, p] of this.latestPlayersState.entries()) {
      if (id === this.localId || playerState === undefined) continue

      this.enemyGraphics.save()
      this.enemyGraphics.translateCanvas(p.x, p.y)
      this.enemyGraphics.rotateCanvas(p.rotation)

      // body
      this.enemyGraphics.fillStyle(0xff6b6b)
      this.enemyGraphics.fillCircle(0, 0, p.playerRadius)
      this.enemyGraphics.lineStyle(6 + (p.maxHp - PLAYER_BASE_HP), 0xcc4444, 1)
      this.enemyGraphics.strokeCircle(0, 0, p.playerRadius - 2)

      // weapon — starts at edge of circle
      drawDrill(this.enemyGraphics, p, 0xff4444)

      this.enemyGraphics.restore()
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