import Phaser from 'phaser'

export class GameScene extends Phaser.Scene {
  private square!: Phaser.GameObjects.Rectangle
  private keys!: Record<string, Phaser.Input.Keyboard.Key>

  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    this.square = this.add.rectangle(400, 300, 50, 50, 0x00ff99)

    this.keys = {
      W: this.input.keyboard!.addKey('W'),
      A: this.input.keyboard!.addKey('A'),
      S: this.input.keyboard!.addKey('S'),
      D: this.input.keyboard!.addKey('D'),
    }
  }

  update() {
    const speed = 3

    if (this.keys.W.isDown) this.square.y -= speed
    if (this.keys.S.isDown) this.square.y += speed
    if (this.keys.A.isDown) this.square.x -= speed
    if (this.keys.D.isDown) this.square.x += speed
  }
}