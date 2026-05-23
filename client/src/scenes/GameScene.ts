import Phaser from 'phaser'

export class GameScene extends Phaser.Scene {
  private container!: Phaser.GameObjects.Container
  private keys!: Record<string, Phaser.Input.Keyboard.Key>

  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    const circle = this.add.circle(0, 0, 25, 0x00ff99)
    const barrel = this.add.rectangle(35, 0, 40, 14, 0x00cc77)

    this.container = this.add.container(400, 300, [barrel, circle])

    this.keys = {
      W: this.input.keyboard!.addKey('W'),
      A: this.input.keyboard!.addKey('A'),
      S: this.input.keyboard!.addKey('S'),
      D: this.input.keyboard!.addKey('D'),
    }
  }

  update() {
    const speed = 3

    if (this.keys.W.isDown) this.container.y -= speed
    if (this.keys.S.isDown) this.container.y += speed
    if (this.keys.A.isDown) this.container.x -= speed
    if (this.keys.D.isDown) this.container.x += speed

    const pointer = this.input.activePointer
    const angle = Phaser.Math.Angle.Between(
      this.container.x, this.container.y,
      pointer.x, pointer.y
    )
    this.container.rotation = angle
  }
}