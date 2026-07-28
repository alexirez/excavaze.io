import Phaser from 'phaser'
import { socket, addSocketListener, getLocalId } from '../network/socket'
import { PlayerState, SquareState } from '../../../protocol/types'
import { ServerMessage } from '../../../protocol/messages'
import { WORLD_WIDTH, WORLD_HEIGHT, COLOR_BACKGROUND, COLOR_OUTER_BOUNDS, WORLD_PADDING, SQUARE_BASE_HP, PLAYER_BASE_HP, PLAYER_BASE_RADIUS } from '../../../protocol/constants'
import { ClientPlayer } from '../entities'
import { cameraScroll, clientPlayers } from '../clientState'

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
    console.log(`[GameScene] create() ran, generation=${GameScene.intervalGeneration + 1}`)
    const generation = ++GameScene.intervalGeneration

    // background of in-bounds area
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH - WORLD_PADDING * 2.5, WORLD_HEIGHT - WORLD_PADDING * 2.5, COLOR_BACKGROUND).setDepth(-1)

    this.cameras.main.setBackgroundColor(COLOR_OUTER_BOUNDS)
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT) // background of outer bounds

    this.cameraTarget = this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 1, 1)
    this.cameraTarget.setVisible(false)
    this.cameras.main.startFollow(this.cameraTarget)

    this.squareHealthBarGraphics = this.add.graphics() // initialize graphics
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

      if (msg.type === 'welcome') {
        this.cameraTarget.x = msg.cameraX
        this.cameraTarget.y = msg.cameraY
        if (!clientPlayers.has(msg.id)) {
          clientPlayers.set(msg.id, { id: msg.id, name: '', bodyColor: 0xff6b6b, borderColor: 0xcc4444,
            xpMultiplier: 1, maxLevel: 7, maxHp: PLAYER_BASE_HP, hpRegenPerSec: 0, moveSpeedMultiplier: 1,
            radius: PLAYER_BASE_RADIUS, collectedPerks: [], drillType: 0, drillDmgMultiplier: 1, drillLengthMultiplier: 1,
            snapshot: { id: msg.id, xp: 0, alive: false, shieldActive: false, x: 0, y: 0, rotation: 0, hp: 0 } })
        }
      }
      else if (msg.type === 'world_state') {
        this.latestPlayersState.clear() // replace player list with newest update from server
        for (const p of msg.players) {
          this.latestPlayersState.set(p.id, {
            id: p.id,
            xp: p.xp,
            alive: p.alive,
            shieldActive: p.shieldActive,
            x: p.x,
            y: p.y,
            rotation: p.rotation,
            hp: p.hp,
          })
          const cp = clientPlayers.get(p.id)
          if (cp) cp.snapshot = this.latestPlayersState.get(p.id)!
        }

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
      if (msg.type === 'player_respawn') {
        clientPlayers.set(msg.id, {
          id: msg.id,
          name: msg.name,
          bodyColor: msg.bodyColor,
          borderColor: msg.borderColor,
          xpMultiplier: msg.xpMultiplier,
          maxLevel: msg.maxLevel,
          maxHp: msg.maxHp,
          hpRegenPerSec: msg.hpRegenPerSec,
          moveSpeedMultiplier: msg.moveSpeedMultiplier,
          radius: msg.radius,
          collectedPerks: msg.collectedPerks,
          drillType: msg.drillType,
          drillDmgMultiplier: msg.drillDmgMultiplier,
          drillLengthMultiplier: msg.drillLengthMultiplier,
          snapshot: { id: msg.id, xp: 0, alive: false, shieldActive: false, x: 0, y: 0, rotation: 0, hp: 0 }
        })
      } 
      if (msg.type === 'player_update') {
        const cp = clientPlayers.get(msg.id)
        if (cp) Object.assign(cp, msg.changes)
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
      if (this.inputInterval) {
        clearInterval(this.inputInterval)
        this.inputInterval = null
      }
      clientPlayers.clear()
      this.enemyNameLabels.forEach(label => label.destroy())
      this.enemyNameLabels.clear()
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
    const cp = clientPlayers.get(localId)
    if (!cp) return
    cameraScroll.x = this.cameras.main.scrollX
    cameraScroll.y = this.cameras.main.scrollY
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
        this.playerGraphics.fillCircle(0, 0, cp.radius * 2.8)
      }
      this.playerGraphics.fillStyle(cp.bodyColor)
      this.playerGraphics.fillCircle(0, 0, cp.radius - 3)
      this.playerGraphics.lineStyle(6, cp.borderColor, 1)
      this.playerGraphics.strokeCircle(0, 0, cp.radius)
      drawDrill(this.playerGraphics, playerState, cp, cp.bodyColor)

      this.playerGraphics.restore()
      
      // player healthbar
      if (playerState.hp < cp.maxHp) {
        const ratio = Math.max(0, playerState.hp / cp.maxHp)
        const bw = 40
        const bh = 5
        this.playerGraphics.fillStyle(0x555555)
        this.playerGraphics.fillRect(playerState.x - bw / 2, playerState.y - cp.radius - 12, bw, bh)
        this.playerGraphics.fillStyle(getHealthColor(ratio))
        this.playerGraphics.fillRect(playerState.x - bw / 2, playerState.y - cp.radius - 12, ratio * bw, bh)
      }
    }

    // Update enemies
    this.enemyGraphics.clear()
    for (const [id, ps] of this.latestPlayersState.entries()) {
      if (id === getLocalId()) continue
      const cp = clientPlayers.get(id)
      if (!cp) continue

      this.enemyGraphics.save()
      this.enemyGraphics.translateCanvas(ps.x, ps.y)
      this.enemyGraphics.rotateCanvas(ps.rotation)

      // spawn shield
      if (ps.shieldActive) {
        const alpha = 0.2 + 0.15 * Math.sin(Date.now() / 150)
        this.enemyGraphics.fillStyle(0x2e79ff, alpha)
        this.enemyGraphics.fillCircle(0, 0, cp.radius * 2.8)
      }

      // body
      this.enemyGraphics.fillStyle(cp.bodyColor)
      this.enemyGraphics.fillCircle(0, 0, cp.radius)
      this.enemyGraphics.lineStyle(6 + (cp.radius * 0.1), cp.borderColor, 1)
      this.enemyGraphics.strokeCircle(0, 0, cp.radius - 2)

      // weapon — starts at edge of circle
      drawDrill(this.enemyGraphics, ps, cp, cp.bodyColor)

      this.enemyGraphics.restore()

      // enemy healthbar
      if (ps.hp < cp.maxHp) {
        const ratio = Math.max(0, ps.hp / cp.maxHp)
        const bw = 40
        const bh = 5
        this.enemyGraphics.fillStyle(0x555555)
        this.enemyGraphics.fillRect(ps.x - bw / 2, ps.y - cp.radius - 12, bw, bh)
        this.enemyGraphics.fillStyle(getHealthColor(ratio))
        this.enemyGraphics.fillRect(ps.x - bw / 2, ps.y - cp.radius - 12, ratio * bw, bh)
      }

      // enemy name label
      if (!this.enemyNameLabels.has(id)) { // create label if it doesn't exist yet
        this.enemyNameLabels.set(id, this.add.text(0, 0, cp.name, {
          fontSize: '24px',
          fontFamily: 'Share Tech',
          color: '#ffffff',
          padding: { x: 4, y: 2 },
          resolution: window.devicePixelRatio
        }).setDepth(80).setOrigin(0.5, 0))
      }
      this.enemyNameLabels.get(id)!.setPosition(ps.x, ps.y + cp.radius + 12)
    }

    // remove labels for players that disconnected
    for (const [id, label] of this.enemyNameLabels) {
      if (!this.latestPlayersState.has(id) || id === getLocalId()) {
        label.destroy()
        this.enemyNameLabels.delete(id)
        clientPlayers.delete(id)
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

function drawDrill(g: Phaser.GameObjects.Graphics, p: PlayerState, cp: ClientPlayer, color: number) {
  const drillType = cp.drillType
  switch (drillType) {
    case 0: drawStackedTrianglesDrill(g, p, cp, color); break
    case 1: drawSingleTriangleDrill(g, p, cp, color); break
    case 2: drawSawblade(g, p, cp, color); break
    case 3: drawDeathblade(g, p, cp, color); break
  }
}

function drawStackedTrianglesDrill(g: Phaser.GameObjects.Graphics, p: PlayerState, cp: ClientPlayer, color: number) {
  const totalLength = 40 * cp.drillLengthMultiplier
  const startX = cp.radius // edge of player circle
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

function drawSingleTriangleDrill(g: Phaser.GameObjects.Graphics, p: PlayerState, cp: ClientPlayer, color: number) {
  const startX = cp.radius
  const width = 10
  const height = 40 * cp.drillLengthMultiplier
  g.fillStyle(color)
  g.fillTriangle(
    startX, -width,
    startX, width,
    startX + height, 0
  )
}

function drawSawblade(g: Phaser.GameObjects.Graphics, p: PlayerState, cp: ClientPlayer, color: number) {
  const offset = cp.radius + 25 + 25 * cp.drillLengthMultiplier
  const radius = 15 + 2 * cp.drillLengthMultiplier
  const spokes = 9
  const angleOffset = Date.now() * 0.003

  g.fillStyle(color)

  // handle — from player edge to blade center
  const handleWidth = 6
  g.fillStyle(color)
  g.fillRect(cp.radius, -handleWidth / 2, offset - cp.radius, handleWidth)

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

function drawDeathblade(g: Phaser.GameObjects.Graphics, p: PlayerState, cp: ClientPlayer, color: number) {
  const offset = cp.radius + 40 + 40 * cp.drillLengthMultiplier
  const radius = 60
  const spokes = 8
  const angleOffset = Date.now() * 0.003

  g.fillStyle(color)
  g.fillRect(cp.radius, -4, offset - cp.radius, 8) // handle
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