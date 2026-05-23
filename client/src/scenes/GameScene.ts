import Phaser from 'phaser'

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    this.add.rectangle(400, 300, 50, 50, 0x00ff99)
  }
}