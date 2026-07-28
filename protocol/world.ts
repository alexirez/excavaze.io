import { WORLD_WIDTH, WORLD_HEIGHT, WORLD_PADDING, PLAYER_BASE_HP, SQUARE_BASE_HP, MIN_OBSTACLE_SPAWN_DIST, SQR_BASE_ROT_SPEED, MAX_SQR_ROT_SPEED, PLAYER_BASE_RADIUS, CHUNK_COLS, CHUNK_ROWS, SQUARE_BASE_BOUNDING_RADIUS, HEAT_RATE, HEAT_SPAWN_THRESHOLD, SHIELD_DURATION, BOT_SPAWN_RADIUS, MAX_PLAYER_COUNT } from '../protocol/constants'
import { DANGER_MAP, DENSITY_MAP } from './data/map'
import { ServerPlayer, ServerSquare } from '../server/src/entities'
import { PlayerState } from './types'
import { currentLevel } from './utils'
import { pickRandomColorCombo } from './data/colors'
import { GameEvent } from './events'

let nextPlayerId = 0
let nextSquareId = 0
const chunkHeat = new Float32Array(CHUNK_ROWS * CHUNK_COLS)

export function spawnSquaresOnStartup(squares: Map<number, ServerSquare>, chunkToSquares: Map<number, Set<number>>) { // Only called on server startup, afterwards use fillMapSquares()
  const chunkW = WORLD_WIDTH / CHUNK_COLS
  const chunkH = WORLD_HEIGHT / CHUNK_ROWS

  for (let row = 0; row < CHUNK_ROWS; row++) {
    for (let col = 0; col < CHUNK_COLS; col++) {
      const toSpawn = DENSITY_MAP[row * CHUNK_COLS + col]
      for (let i = 0; i < toSpawn; i++) {
        const id = assignNextSquareId()
        squares.set(id, {
          state: {
            id: id,
            x: col * chunkW + Math.random() * chunkW,
            y: row * chunkH + Math.random() * chunkH,
            hp: SQUARE_BASE_HP * DANGER_MAP[row * CHUNK_COLS + col],
            maxHp: SQUARE_BASE_HP * DANGER_MAP[row * CHUNK_COLS + col],
            rotation: Math.random() * Math.PI * 2,
          },
          pathAngle: Math.random() * Math.PI * 2,
          boundingRadius : SQUARE_BASE_BOUNDING_RADIUS * DANGER_MAP[row * CHUNK_COLS + col],
          rotationSpeed: Math.max(-MAX_SQR_ROT_SPEED, Math.min(MAX_SQR_ROT_SPEED, 
            (Math.random() - 0.5) * 2 * SQR_BASE_ROT_SPEED))
        })
        const chunkIndex = row * CHUNK_COLS + col
        chunkToSquares.get(chunkIndex)?.add(id)
      }
    }
  }
}

// Fill the map with squares up to the desired density
export function fillMapSquares(squares: Map<number, ServerSquare>,
  chunkToSquares: Map<number, Set<number>>,
  players: Map<number, ServerPlayer>) {
  const chunkW = WORLD_WIDTH / CHUNK_COLS
  const chunkH = WORLD_HEIGHT / CHUNK_ROWS

  for (let row = 0; row < CHUNK_ROWS; row++) {
    for (let col = 0; col < CHUNK_COLS; col++) {
      const idx = row * CHUNK_COLS + col
      const deficit = DENSITY_MAP[idx] - chunkToSquares.get(idx)!.size
      if (deficit <= 0) { chunkHeat[idx] = 0; continue }
      chunkHeat[idx] += HEAT_RATE * deficit

      while (chunkHeat[idx] > HEAT_SPAWN_THRESHOLD) {
        chunkHeat[idx] -= HEAT_SPAWN_THRESHOLD
        const randX = col * chunkW + Math.random() * chunkW
        const randY = row * chunkH + Math.random() * chunkH
        if (!isSpawnClearOfPlayers(players, randX, randY, MIN_OBSTACLE_SPAWN_DIST)) continue
        const id = assignNextSquareId()
        squares.set(id, {
          state: {
            id: id,
            x: randX,
            y: randY,
            hp: SQUARE_BASE_HP * DANGER_MAP[row * CHUNK_COLS + col],
            maxHp: SQUARE_BASE_HP * DANGER_MAP[row * CHUNK_COLS + col],
            rotation: Math.random() * Math.PI * 2,
          },
          pathAngle: Math.random() * Math.PI * 2,
          boundingRadius : SQUARE_BASE_BOUNDING_RADIUS * DANGER_MAP[row * CHUNK_COLS + col],
          rotationSpeed: Math.max(-MAX_SQR_ROT_SPEED, Math.min(MAX_SQR_ROT_SPEED, 
            (Math.random() - 0.5) * 2 * SQR_BASE_ROT_SPEED))
        })
      }
    }
  }
}

export function getChunkIndex(x: number, y: number): number {
  const col = Math.floor(x / (WORLD_WIDTH / CHUNK_COLS))
  const row = Math.floor(y / (WORLD_HEIGHT / CHUNK_ROWS))
  return row * CHUNK_COLS + col
}

export function getNearbySquareIds(chunkToSquares: Map<number, Set<number>>, chunkIndex: number, out: number[]): void {
  out.length = 0
  const col = chunkIndex % CHUNK_COLS
  const row = Math.floor(chunkIndex / CHUNK_COLS)
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nc = col + dc
      const nr = row + dr
      if (nc >= 0 && nc < CHUNK_COLS && nr >= 0 && nr < CHUNK_ROWS) {
        const neighbors = chunkToSquares.get(nr * CHUNK_COLS + nc)!
        for (const id of neighbors) out.push(id)
      }
    }
  }
}

export function assignNextSquareId() {
    if (nextSquareId >= 9007199254740991)
        nextSquareId = 0
    else
        nextSquareId++
    return nextSquareId
}

export function assignNextPlayerId() {
    if (nextPlayerId >= 9007199254740991)
        nextPlayerId = 0
    else
        nextPlayerId++
    return nextPlayerId
}

// Returns whether or not spot is available for obstacles to spawn here.
// *Only accounts for players, not other obstacles
function isSpawnClearOfPlayers(players: Map<number, ServerPlayer>, spawnX: number, spawnY: number, minDist: number): boolean {
  for (const p of players.values()) {
    const dx = p.state.x - spawnX
    const dy = p.state.y - spawnY
    if (dx * dx + dy * dy < (minDist + p.radius)**2) return false
  }
  return true
}

export function pickPlayerSpawnPoint(players: Map<number, ServerPlayer>): { x: number, y: number } {
  let bestX = WORLD_WIDTH / 2, bestY = WORLD_HEIGHT / 2, bestScore = -1

  for (let i = 0; i < 30; i++) {
    const x = WORLD_PADDING + Math.random() * (WORLD_WIDTH - WORLD_PADDING * 2)
    const y = WORLD_PADDING + Math.random() * (WORLD_HEIGHT - WORLD_PADDING * 2)
    const score = spawnPointScore(players, x, y, false)
    if (score > bestScore) { bestX = x, bestY = y, bestScore = score }
  }

  return { x: bestX, y: bestY }
}

export function spawnPointScore(players: Map<number, ServerPlayer>, x: number, y: number, isBot: boolean): number {
  const idealDist = 1200
  const nearest = Math.sqrt(nearestPlayerDist(players, x, y))
  const distScore = Math.max(0, 1 - Math.abs(nearest - idealDist) / idealDist)
  const danger = DANGER_MAP[getChunkIndex(x, y)] + 0.001 // avoid division by zero

  if (isBot) return distScore * danger
  return distScore / danger
}

export function nearestPlayerDist(players: Map<number, ServerPlayer>, x: number, y: number): number {
  let minSqDist = Infinity
  for (const p of players.values()) {
    const dx = p.state.x - x
    const dy = p.state.y - y
    minSqDist = Math.min(minSqDist, dx * dx + dy * dy)
  }
  return minSqDist
}

export function spawnBots(players: Map<number, ServerPlayer>, cameraX: number, cameraY: number, events: GameEvent[]) {
  const botBudget = MAX_PLAYER_COUNT - 10
  const currentPlayers = players.size
  if (currentPlayers >= botBudget) return

  // find the real player most deserving of a bot
  let bestPlayer: PlayerState | null = null
  let bestScore = -1
  for (const p of players.values()) {
    if (p.socket === null || !p.state.alive) continue
    const score = currentLevel(p.state.xp) // simple for now, expand later
    if (score > bestScore) { bestScore = score; bestPlayer = p.state }
  }

  if (bestPlayer) spawnBotForPlayer(bestPlayer, players, events)
  else if (botBudget > 7) {
    spawnBotNearCamera(cameraX, cameraY, players, events)
  }
}

function spawnBot(x: number, y: number, players: Map<number, ServerPlayer>, events: GameEvent[]) {
  const dangerLevel = DANGER_MAP[getChunkIndex(x, y)]
  const strengthMultiplier = dangerLevel * Math.random()
  const radius = 20 + 12 * (strengthMultiplier)
  const id = assignNextPlayerId()
  const { bodyColor, borderColor } = pickRandomColorCombo()
  const bot: ServerPlayer = {
    socket: null,
    state: {
      id,
      xp: 0,
      alive: true,
      shieldActive: true,
      x,
      y,
      rotation: 0,
      hp: PLAYER_BASE_HP * (1 + strengthMultiplier),
    },
    name: generateBotName(players),
    bodyColor: bodyColor,
    borderColor: borderColor,
    xpMultiplier: 1,
    maxLevel: 7,
    maxHp: PLAYER_BASE_HP * (1 + strengthMultiplier),
    hpRegenPerSec: Math.ceil(Math.random() * 6) % 3,
    moveSpeedMultiplier: Math.sqrt(PLAYER_BASE_RADIUS / radius),
    radius: radius,
    collectedPerks: [],
    drillType: 0,
    drillDmgMultiplier: 0.7 + (dangerLevel - 1) * 0.1,
    drillLengthMultiplier: 0.7 + (dangerLevel * Math.min(Math.random(), 0.2)) * 0.5,
    input: { dx: 0, dy: 0, rotation: 0 },
    shieldTicks: SHIELD_DURATION,
    lastCollisionTime: 0,
    spawnedAt: Date.now(),
    wanderAngle: Math.random() * Math.PI * 2,
    gems: 0,
    activeQuests: [],
    purchasedUpgrades: [],
    pendingPerkChoices: [],
  }
  players.set(id, bot)

  events.push({
    kind: 'bot_spawned',
    id,
    name: bot.name,
    bodyColor: bot.bodyColor,
    borderColor: bot.borderColor,
    xpMultiplier: bot.xpMultiplier,
    maxLevel: bot.maxLevel,
    maxHp: bot.maxHp,
    hpRegenPerSec: bot.hpRegenPerSec,
    moveSpeedMultiplier: bot.moveSpeedMultiplier,
    radius: bot.radius,
    collectedPerks: bot.collectedPerks,
    drillType: bot.drillType,
    drillDmgMultiplier: bot.drillDmgMultiplier,
    drillLengthMultiplier: bot.drillLengthMultiplier,
  })
}

function spawnBotForPlayer(player: PlayerState, players: Map<number, ServerPlayer>, events: GameEvent[]) {
  let bestX = WORLD_WIDTH / 2, bestY = WORLD_HEIGHT / 2, bestScore = -1

  for (let i = 0; i < 30; i++) {
    const dx = (i/15 - 0.5) * 2 * BOT_SPAWN_RADIUS
    const dy = (i % 2 === 0 ? 1 : -1) * (BOT_SPAWN_RADIUS - Math.abs(dx))
    const x = Math.max(WORLD_PADDING, Math.min(WORLD_WIDTH - WORLD_PADDING, player.x + dx))
    const y = Math.max(WORLD_PADDING, Math.min(WORLD_HEIGHT - WORLD_PADDING, player.y + dy))
    const score = spawnPointScore(players, x, y, true)
    if (score > bestScore) { bestX = x; bestY = y; bestScore = score }
  }

  spawnBot(bestX, bestY, players, events)
}

export function spawnBotNearCamera(cameraX: number, cameraY: number, players: Map<number, ServerPlayer>, events: GameEvent[], distance: number = 2000) {
  const angle = Math.random() * Math.PI * 2
  const x = Math.max(WORLD_PADDING, Math.min(WORLD_WIDTH - WORLD_PADDING, cameraX + Math.cos(angle) * distance))
  const y = Math.max(WORLD_PADDING, Math.min(WORLD_HEIGHT - WORLD_PADDING, cameraY + Math.sin(angle) * distance))
  spawnBot(x, y, players, events)
}

const BOT_NAMES = [
  'Boreworm', 'YOURENDHASCOME', 'RealPlayer', 'Cavefish', 'Rockbreaker',
  'Deepdelver', 'Ironmaw', 'Dustcloud', 'Cobalt', 'Gravel', 'Unnamed',
  'MasterOfTheMines', 'Pitlord', 'Bedrock', 'Quarryman',
  'NotABot', 'TrulyHuman', 'JustPassingThrough',
  'WhyAmIHere', 'SendHelp', 'OopsAllDrill', 'DrillOrBeGrilled',
  'YesIAmReal', 'DefinitelyNotAI', 'Muscleman'
]

const BOT_NAME_PREFIXES = [
  'Digger', 'Mole', 'Tunneler', 'Drillbit', 'Excavator', 'Driller', 
  'Player', 'Pro', 'ProPlayer', 'Drill', 'Caveman', 'Rock', 'Iron', 
  'Dust', 'Gopher', 'Pebble', 'Boulder', 'Crater'
]

function generateBotName(players: Map<number, ServerPlayer>): string {
  const usedNames = new Set([...players.values()].map(p => p.name))
  const availableFullNames = BOT_NAMES.filter(n => !usedNames.has(n))

  if (Math.random() < 0.8 && availableFullNames.length > 0)
    return availableFullNames[Math.floor(Math.random() * availableFullNames.length)]
  const prefix = BOT_NAME_PREFIXES[Math.floor(Math.random() * BOT_NAME_PREFIXES.length)]
  let digits = Math.floor(1000 + Math.random() * 9000) // always 4 digits
  const name = `${prefix}${digits}`
  while (usedNames.has(name)) digits++
  return `${prefix}${digits}`
}