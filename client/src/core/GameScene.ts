import Phaser from 'phaser'
import { socket, addSocketListener, getLocalId } from '../network/socket'
import { PlayerState, SquareState } from '../../../protocol/types'
import { ServerMessage } from '../../../protocol/messages'
import { WORLD_WIDTH, WORLD_HEIGHT, COLOR_BACKGROUND, COLOR_OUTER_BOUNDS, WORLD_PADDING, SQUARE_BASE_HP, PLAYER_BASE_HP } from '../../../protocol/constants'

export class GameScene extends Phaser.Scene {
  private enemyNameLabels: Map<number, Phaser.GameObjects.Text> = new Map()
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private latestPlayersState: Map<number, PlayerState> = new Map()
  private latestSquaresState: Map<number, SquareState> = new Map()
  private squareGraphics!: Phaser.GameObjects.Graphics
  private squareHealthBarGraphics!: Phaser.GameObjects.Graphics
  private playerGraphics!: Phaser.GameObjects.Graphics
  private enemyGraphics!: Phaser.GameObjects.Graphics
  private cameraTarget!: Phaser.GameObjects.Rectangle

  private inputInterval: ReturnType<typeof setInterval> | null = null
  private removeSocketListener: (() => void) | null = null
  private static intervalGeneration = 0

  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    const generation = ++GameScene.intervalGeneration

    // background of in-bounds area
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH - WORLD_PADDING * 2.5, WORLD_HEIGHT - WORLD_PADDING * 2.5, COLOR_BACKGROUND).setDepth(-1)

    // background of outer bounds
    this.cameras.main.setBackgroundColor(COLOR_OUTER_BOUNDS)
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    this.cameraTarget = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 1, 1)
    this.cameraTarget.setVisible(false)
    this.cameras.main.startFollow(this.cameraTarget)

    // initialize graphics
    this.squareHealthBarGraphics = this.add.graphics()
    this.squareHealthBarGraphics.setDepth(20)
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
            hpRegenPerSec: p.hpRegenPerSec,
            moveSpeedMultiplier: p.moveSpeedMultiplier,
            radius: p.radius,
            collectedPerks: p.collectedPerks,
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
    this.removeSocketListener = addSocketListener(handler)

    // Send input to server every tick
    if (this.inputInterval) clearInterval(this.inputInterval)
    this.inputInterval = setInterval(() => {
      if (generation !== GameScene.intervalGeneration) {
        clearInterval(this.inputInterval!)
        this.inputInterval = null
        return
      }
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

    this.events.on('shutdown', () => {
      console.trace('[GameScene] shutdown fired')
      this.removeSocketListener?.()
      this.removeSocketListener = null
    })
  }

  // Only rendering, game logic is on server side
  update() {
    if (getLocalId() === null) return // no id assigned yet -> do nothing

    const localId = getLocalId()
    if (localId === null) return
    const playerState = this.latestPlayersState.get(localId)
    this.playerGraphics.clear()
    if (playerState) {
      this.cameraTarget.x = playerState.x
      this.cameraTarget.y = playerState.y
      this.playerGraphics.save()
      this.playerGraphics.translateCanvas(playerState.x, playerState.y)
      this.playerGraphics.rotateCanvas(playerState.rotation)
      if (playerState.shieldActive) {
        const alpha = 0.2 + 0.15 * Math.sin(Date.now() / 150)
        this.playerGraphics.fillStyle(0x2e79ff, alpha)
        this.playerGraphics.fillCircle(0, 0, playerState.radius * 2.8)
      }
      this.playerGraphics.fillStyle(0x00ff99)
      this.playerGraphics.fillCircle(0, 0, playerState.radius - 3)
      this.playerGraphics.lineStyle(2, 0x00aa66, 1)
      this.playerGraphics.strokeCircle(0, 0, playerState.radius)
      drawDrill(this.playerGraphics, playerState, 0x00cc77)

      this.playerGraphics.restore()
      
      // player healthbar
      if (playerState.hp < playerState.maxHp) {
        const ratio = Math.max(0, playerState.hp / playerState.maxHp)
        const bw = 40
        const bh = 5
        this.playerGraphics.fillStyle(0x555555)
        this.playerGraphics.fillRect(playerState.x - bw / 2, playerState.y - playerState.radius - 12, bw, bh)
        this.playerGraphics.fillStyle(getHealthColor(ratio))
        this.playerGraphics.fillRect(playerState.x - bw / 2, playerState.y - playerState.radius - 12, ratio * bw, bh)
      }
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
        this.enemyGraphics.fillCircle(0, 0, p.radius * 2.8)
      }

      // body
      this.enemyGraphics.fillStyle(0xff6b6b)
      this.enemyGraphics.fillCircle(0, 0, p.radius)
      this.enemyGraphics.lineStyle(6 + (p.radius * 0.1), 0xcc4444, 1)
      this.enemyGraphics.strokeCircle(0, 0, p.radius - 2)

      // weapon — starts at edge of circle
      drawDrill(this.enemyGraphics, p, 0xff4444)

      this.enemyGraphics.restore()

      // enemy healthbar
      if (p.hp < p.maxHp) {
        const ratio = Math.max(0, p.hp / p.maxHp)
        const bw = 40
        const bh = 5
        this.enemyGraphics.fillStyle(0x555555)
        this.enemyGraphics.fillRect(p.x - bw / 2, p.y - p.radius - 12, bw, bh)
        this.enemyGraphics.fillStyle(getHealthColor(ratio))
        this.enemyGraphics.fillRect(p.x - bw / 2, p.y - p.radius - 12, ratio * bw, bh)
      }

      // enemy name label
      if (!this.enemyNameLabels.has(id)) { // create label if it doesn't exist yet
        this.enemyNameLabels.set(id, this.add.text(0, 0, p.name, {
          fontSize: '24px',
          fontFamily: 'Share Tech',
          color: '#ffffff',
          padding: { x: 4, y: 2 },
          resolution: window.devicePixelRatio
        }).setDepth(80).setOrigin(0.5, 0))
      }
      this.enemyNameLabels.get(id)!.setPosition(p.x, p.y + p.radius + 12)
    }

    // remove labels for players that disconnected
    for (const [id, label] of this.enemyNameLabels) {
      if (!this.latestPlayersState.has(id) || id === getLocalId()) {
        label.destroy()
        this.enemyNameLabels.delete(id)
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
    case 2: drawSawblade(g, p, color); break
    case 3: drawDeathblade(g, p, color); break
  }
}

function drawStackedTrianglesDrill(g: Phaser.GameObjects.Graphics, p: PlayerState, color: number) {
  const totalLength = 40 * p.drillLengthMultiplier
  const startX = p.radius // edge of player circle
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
  const startX = p.radius
  const width = 10
  const height = 40 * p.drillLengthMultiplier
  g.fillStyle(color)
  g.fillTriangle(
    startX, -width,
    startX, width,
    startX + height, 0
  )
}

function drawSawblade(g: Phaser.GameObjects.Graphics, p: PlayerState, color: number) {
  const offset = p.radius + 25 + 25 * p.drillLengthMultiplier
  const radius = 15 + 2 * p.drillLengthMultiplier
  const spokes = 9
  const angleOffset = Date.now() * 0.003

  g.fillStyle(color)

  // handle — from player edge to blade center
  const handleWidth = 6
  g.fillStyle(color)
  g.fillRect(p.radius, -handleWidth / 2, offset - p.radius, handleWidth)

  g.fillCircle(offset, 0, radius) // saw

  // spokes
  for (let i = 0; i < spokes; i++) {
    const angle = (i / spokes) * Math.PI * 2 + angleOffset
    const tx = offset + Math.cos(angle) * (radius + 6)
    const ty = Math.sin(angle) * (radius + 6)
    g.fillTriangle(
      offset + Math.cos(angle - 0.3) * radius, Math.sin(angle - 0.3) * radius,
      offset + Math.cos(angle + 0.3) * radius, Math.sin(angle + 0.3) * radius,
      tx, ty
    )
  }
}

function drawDeathblade(g: Phaser.GameObjects.Graphics, p: PlayerState, color: number) {
  const offset = p.radius + 40 + 40 * p.drillLengthMultiplier
  const radius = 60
  const spokes = 8
  const angleOffset = Date.now() * 0.003

  g.fillStyle(color)
  g.fillRect(p.radius, -4, offset - p.radius, 8) // handle
  g.fillCircle(offset, 0, 6)
  g.fillStyle(color, 0.7)
  g.fillCircle(offset, 0, radius) // giant saw

  for (let i = 0; i < spokes; i++) {
    const angle = (i / spokes) * Math.PI * 2 + angleOffset
    const tx = offset + Math.cos(angle) * (radius + 10)
    const ty = Math.sin(angle) * (radius + 10)
    g.fillTriangle(
      offset + Math.cos(angle - 0.25) * radius, Math.sin(angle - 0.25) * radius,
      offset + Math.cos(angle + 0.25) * radius, Math.sin(angle + 0.25) * radius,
      tx, ty
    )
  }
}