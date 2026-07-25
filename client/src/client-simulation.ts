import { ServerPlayer, ServerSquare } from '../../server/src/entities'
import { WorldStateMessage, ClientMessage, ServerMessage, WelcomeMessage, PlayerKilledMessage, DeathScreenMessage, ServerRespawnMessage, PlayerUpdateMessage, PurchaseResultMessage } from '../../protocol/messages'
import { TICK_MS, WORLD_WIDTH, WORLD_HEIGHT, WORLD_PADDING, PLAYER_BASE_HP, SQUARE_BASE_HP, PLAYER_COLLISION_DAMAGE, KILL_SQUARE_XP_MULTIPLIER, SQR_COLLISION_BASE_DMG, SQR_COLLISION_DMG_FACTOR, COLLISION_COOLDOWN, PLAYER_BASE_RADIUS, PLAYER_BASE_SPEED, CHUNK_ROWS, CHUNK_COLS, SHIELD_DURATION } from '../../protocol/constants'
import { PlayerState, SquareState } from '../../protocol/types'
import { computeBotInput } from '../../protocol/bot-behavior'
import { isDrillPerk, PERK_EFFECTS, PERK_TREE, removeDrillPerks, rollPerkChoices } from '../../protocol/data/perks'
import { assignNextPlayerId, fillMapSquares, getChunkIndex, getNearbySquareIds, pickPlayerSpawnPoint, spawnBots, spawnSquaresOnStartup } from '../../protocol/world'
import { awardXp, circleIntersectsOrientedRect, getDrillDamageOnCircle, getDrillDamageOnRect, getDrillReach, killPlayer } from '../../protocol/combat'
import { currentLevel, refreshStats } from '../../protocol/utils'
import { UPGRADE_NODES } from '../../protocol/data/upgrade-nodes'
import { GameEvent } from '../../protocol/events'
import { loadOfflineGems, saveOfflineGems, loadOfflineUpgrades, saveOfflineUpgrades } from '../storage/offlineStorage'

const SQUARE_SPEED = 0.5
let tick = 0

// A non-null placeholder so shared code (world.ts/combat.ts), which checks
// `socket === null` to mean "this is a bot", correctly treats the local
// player as a real player. Never read or called as an actual socket.
const LOCAL_PLAYER_SOCKET = {} as unknown as ServerPlayer['socket']

const players = new Map<number, ServerPlayer>()
const squares = new Map<number, ServerSquare>()
const playerStates: PlayerState[] = []
const squareStates: SquareState[] = []
const nearbyPlayers: ServerPlayer[] = []
const nearbySquareIds: number[] = []
const squaresToDelete: number[] = []
const chunkToSquares = new Map<number, Set<number>>()
for (let i = 0; i < CHUNK_ROWS * CHUNK_COLS; i++) chunkToSquares.set(i, new Set())
const cameraX = Math.random() * WORLD_WIDTH
const cameraY = Math.random() * WORLD_HEIGHT
const events: GameEvent[] = []

let localId: number | null = null
let running = false
let rafHandle: number | null = null
let lastFrameTime = 0
let accumulator = 0

const listeners: ((event: MessageEvent) => void)[] = []
let welcomeCallback: ((id: number, gems: number, upgrades: string[]) => void) | null = null

function emit(msg: ServerMessage) {
  const fakeEvent = { data: JSON.stringify(msg) } as MessageEvent
  if (msg.type === 'welcome') {
    localId = msg.id
    welcomeCallback?.(msg.id, msg.gems, msg.upgrades ?? [])
    welcomeCallback = null
  }
  for (const listener of listeners) listener(fakeEvent)
}

spawnSquaresOnStartup(squares, chunkToSquares)

// ============================================================
// Public interface — same shape as network/socket.ts
// ============================================================

export function addSocketListener(fn: (event: MessageEvent) => void): () => void {
  listeners.push(fn)
  return () => {
    const i = listeners.indexOf(fn)
    if (i !== -1) listeners.splice(i, 1)
  }
}

export function onWelcome(cb: (id: number, gems: number, upgrades: string[]) => void): void {
  welcomeCallback = cb
}

export function getOfflineId(): number | null {
  return localId
}

export const localSocket = {
  send(data: string): void {
    handleClientMessage(JSON.parse(data) as ClientMessage)
  },

  isOpen(): boolean {
    return running
  },

  onceOpen(callback: () => void): void {
    callback()
  },

  onWelcome,

  get readyState() { return running ? WebSocket.OPEN : WebSocket.CLOSED },

  connect(): void {
    if (running) return
    running = true
    localId = assignNextPlayerId()
    players.set(localId, {
      socket: LOCAL_PLAYER_SOCKET,
      state: { id: localId, xp: 0, alive: false, shieldActive: false, x: 0, y: 0, rotation: 0, hp: PLAYER_BASE_HP },
      name: 'Player',
      bodyColor: 0xff6b6b,
      borderColor: 0xcc4444,
      xpMultiplier: 1,
      maxLevel: 12,
      maxHp: PLAYER_BASE_HP,
      hpRegenPerSec: 0,
      moveSpeedMultiplier: 1,
      radius: PLAYER_BASE_RADIUS,
      collectedPerks: [],
      drillType: 0,
      drillDmgMultiplier: 1,
      drillLengthMultiplier: 1,
      input: { dx: 0, dy: 0, rotation: 0 },
      shieldTicks: SHIELD_DURATION,
      lastCollisionTime: 0,
      spawnedAt: Date.now(),
      wanderAngle: Math.random() * Math.PI * 2,
      gems: 0,
      activeQuests: [],
      purchasedUpgrades: [],
      pendingPerkChoices: [],
    })
    lastFrameTime = performance.now()
    accumulator = 0
    rafHandle = requestAnimationFrame(frame)
  },

  disconnect(): Promise<void> {
    running = false
    if (rafHandle !== null) cancelAnimationFrame(rafHandle)
    rafHandle = null
    if (localId !== null) players.delete(localId)
    localId = null
    return Promise.resolve()
  },
}

// ============================================================
// Fixed-timestep loop
// ============================================================

function frame(now: number) {
  if (!running) return
  accumulator += now - lastFrameTime
  lastFrameTime = now

  while (accumulator >= TICK_MS) {
    runTick()
    accumulator -= TICK_MS
  }

  rafHandle = requestAnimationFrame(frame)
}

function runTick() {
  tick++
  events.length = 0

  // 1) Process player/bots input
  for (const p of players.values()) {
    if (!p.state.alive) continue
    p.state.x = Math.max(WORLD_PADDING, Math.min(WORLD_WIDTH - WORLD_PADDING, p.state.x + p.input.dx * p.moveSpeedMultiplier * PLAYER_BASE_SPEED))
    p.state.y = Math.max(WORLD_PADDING, Math.min(WORLD_HEIGHT - WORLD_PADDING, p.state.y + p.input.dy * p.moveSpeedMultiplier * PLAYER_BASE_SPEED))
    p.state.rotation = p.input.rotation

    if (p.shieldTicks > 0) {
      p.shieldTicks--
      if (p.shieldTicks <= 0) p.state.shieldActive = false
    }
    p.state.hp = Math.min(p.state.hp + p.hpRegenPerSec, p.maxHp)
  }

  // 2) Player-to-player collisions
  for (const [idA, a] of players) {
    if (!a.state.alive) continue
    for (const [idB, b] of players) {
      if (!b.state.alive || idB <= idA) continue
      const dx = a.state.x - b.state.x
      const dy = a.state.y - b.state.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const radiusSum = a.radius + b.radius

      if (dist < radiusSum && dist > 0.001) {
        if (!a.state.shieldActive && Date.now() - a.lastCollisionTime >= COLLISION_COOLDOWN) {
          a.state.hp -= PLAYER_COLLISION_DAMAGE
          a.lastCollisionTime = Date.now()
        }
        if (!b.state.shieldActive && Date.now() - b.lastCollisionTime >= COLLISION_COOLDOWN) {
          b.state.hp -= PLAYER_COLLISION_DAMAGE
          b.lastCollisionTime = Date.now()
        }
        if (b.state.hp <= 0) killPlayer(a, b, 'player', players, events)
        if (a.state.hp <= 0) killPlayer(b, a, 'player', players, events)
      }
    }
  }

  // 3) Drill-vs-player collisions
  for (const [idA, a] of players) {
    if (!a.state.alive) continue
    const aReach = getDrillReach(a)
    for (const [idB, b] of players) {
      if (!b.state.alive || idA === idB || b.state.shieldActive) continue
      const dx = a.state.x - b.state.x
      const dy = a.state.y - b.state.y
      if (dx * dx + dy * dy > (aReach + b.radius) ** 2) continue
      b.state.hp -= getDrillDamageOnCircle(
        a.state.x, a.state.y, a.state.rotation, a.radius,
        a.drillType, a.drillLengthMultiplier, a.drillDmgMultiplier,
        b.state.x, b.state.y, b.radius
      )
      if (b.state.hp <= 0) killPlayer(a, b, 'drill', players, events)
    }
  }

  // 4) Drill/collision-vs-square
  for (const p of players.values()) {
    if (!p.state.alive) continue
    const chunkIndex = getChunkIndex(p.state.x, p.state.y)
    getNearbySquareIds(chunkToSquares, chunkIndex, nearbySquareIds)
    const drillReach = getDrillReach(p)

    for (const id of nearbySquareIds) {
      const square = squares.get(id)
      if (!square) continue
      const dx = p.state.x - square.state.x
      const dy = p.state.y - square.state.y
      const sqrDist = dx * dx + dy * dy
      if (sqrDist > (drillReach + square.boundingRadius) ** 2) continue

      const sqSize = 20 + (square.state.maxHp / SQUARE_BASE_HP) * 10
      const sqHalf = sqSize / 2

      square.state.hp -= getDrillDamageOnRect(
        p.state.x, p.state.y, p.state.rotation, p.radius,
        p.drillType, p.drillLengthMultiplier, p.drillDmgMultiplier,
        square.state.x, square.state.y, square.state.rotation, sqHalf, sqHalf
      )
      if (square.state.hp <= 0) {
        awardXp(p, KILL_SQUARE_XP_MULTIPLIER * square.state.maxHp)
        events.push({ kind: 'square_killed', killerId: p.state.id })
      }

      if (circleIntersectsOrientedRect(
        p.state.x, p.state.y, p.radius,
        square.state.x, square.state.y, square.state.rotation, sqHalf, sqHalf
      )) {
        square.state.hp -= PLAYER_COLLISION_DAMAGE
        if (square.state.hp <= 0) {
          awardXp(p, KILL_SQUARE_XP_MULTIPLIER * square.state.maxHp)
          events.push({ kind: 'square_killed', killerId: p.state.id })
        }
        if (!p.state.shieldActive && Date.now() - p.lastCollisionTime > COLLISION_COOLDOWN) {
          p.state.hp -= SQR_COLLISION_BASE_DMG + square.state.maxHp * SQR_COLLISION_DMG_FACTOR
          p.lastCollisionTime = Date.now()
        }
        if (p.state.hp <= 0) killPlayer(null, p, 'square', players, events)
      }
    }
  }

  // 5) Bot input — everyone except the local player is a bot in offline mode
  if (tick % 3 === 0) {
    for (const p of players.values()) {
      if (p.state.id === localId || !p.state.alive) continue
      nearbyPlayers.length = 0
      for (const other of players.values()) {
        if (!other.state.alive) continue
        const dx = other.state.x - p.state.x
        const dy = other.state.y - p.state.y
        if (dx * dx + dy * dy < 800 * 800) nearbyPlayers.push(other)
      }
      const chunkIndex = getChunkIndex(p.state.x, p.state.y)
      getNearbySquareIds(chunkToSquares, chunkIndex, nearbySquareIds)
      computeBotInput(p, nearbyPlayers, nearbySquareIds, squares)
    }
  }

  // 6) Spawn bots
  if (tick % 50 === 0) spawnBots(players, cameraX, cameraY, events)

  // 7) Square lifecycle
  squaresToDelete.length = 0
  for (const sq of squares.values()) {
    if (
      sq.state.x < -WORLD_PADDING || sq.state.x > WORLD_WIDTH + WORLD_PADDING ||
      sq.state.y < -WORLD_PADDING || sq.state.y > WORLD_HEIGHT + WORLD_PADDING ||
      sq.state.hp <= 0
    ) {
      squaresToDelete.push(sq.state.id)
    } else {
      sq.pathAngle += (Math.random() - 0.5) * 0.2
      sq.state.rotation += sq.rotationSpeed
      sq.state.x += Math.cos(sq.pathAngle) * SQUARE_SPEED
      sq.state.y += Math.sin(sq.pathAngle) * SQUARE_SPEED
    }
  }
  for (const id of squaresToDelete) squares.delete(id)

  // 8) Recompute chunks
  for (const set of chunkToSquares.values()) set.clear()
  for (const [id, square] of squares) {
    const index = getChunkIndex(square.state.x, square.state.y)
    chunkToSquares.get(index)?.add(id)
  }

  // 9) Refill obstacles
  if (tick % 10 === 0) fillMapSquares(squares, chunkToSquares, players)

  // 10) React to events
  for (const e of events) handleClientEvent(e)

  // 11) Emit world state to listeners
  playerStates.length = 0
  squareStates.length = 0
  for (const p of players.values()) if (p.state.alive) playerStates.push(p.state)
  for (const sq of squares.values()) squareStates.push(sq.state)
  emit({ type: 'world_state', players: playerStates, squares: squareStates } satisfies WorldStateMessage)
}

// ============================================================
// Inbound: fake socket.send() -> same message handling as index.ts
// ============================================================

async function handleClientMessage(msg: ClientMessage) {
  if (localId === null) return
  const local = players.get(localId)
  if (!local) return

  if (msg.type === 'input') {
    local.input = { dx: msg.dx, dy: msg.dy, rotation: msg.rotation }

  } else if (msg.type === 'guest_login') {
    const [gems, purchasedUpgrades] = await Promise.all([loadOfflineGems(), loadOfflineUpgrades()])
    local.gems = gems
    local.purchasedUpgrades = purchasedUpgrades
    emit({ type: 'welcome', id: localId, gems, upgrades: purchasedUpgrades, cameraX, cameraY } satisfies WelcomeMessage)

  } else if (msg.type === 'client_respawn') {
    if (local.state.alive) return
    const { x, y } = pickPlayerSpawnPoint(players)
    local.name = msg.name
    local.bodyColor = msg.bodyColor
    local.borderColor = msg.borderColor
    local.state.xp *= 0.8
    local.state.alive = true
    local.spawnedAt = Date.now()
    local.state.shieldActive = true
    local.state.x = x
    local.state.y = y
    local.collectedPerks = []
    local.shieldTicks = SHIELD_DURATION
    local.purchasedUpgrades = msg.upgrades ?? []
    refreshStats(local, local.purchasedUpgrades)
    local.state.hp = local.maxHp

    emit({
      type: 'player_respawn', id: localId, name: local.name, bodyColor: local.bodyColor, borderColor: local.borderColor,
      xpMultiplier: local.xpMultiplier, maxLevel: local.maxLevel, maxHp: local.maxHp, hpRegenPerSec: local.hpRegenPerSec,
      moveSpeedMultiplier: local.moveSpeedMultiplier, radius: local.radius, collectedPerks: local.collectedPerks,
      drillType: local.drillType, drillDmgMultiplier: local.drillDmgMultiplier, drillLengthMultiplier: local.drillLengthMultiplier,
    } satisfies ServerRespawnMessage)

  } else if (msg.type === 'select_perk') {
    if (!local.state.alive) return
    if (!local.pendingPerkChoices.includes(msg.perkId)) return
    local.pendingPerkChoices = []
    const perk = PERK_TREE[msg.perkId]
    if (!perk) return
    if (local.collectedPerks.includes(msg.perkId)) return
    if (isDrillPerk(msg.perkId)) removeDrillPerks(local)
    local.collectedPerks.push(msg.perkId)
    refreshStats(local, local.purchasedUpgrades)
    PERK_EFFECTS[msg.perkId]?.(local)

    emit({
      type: 'player_update', id: localId,
      changes: {
        drillType: local.drillType, drillLengthMultiplier: local.drillLengthMultiplier, drillDmgMultiplier: local.drillDmgMultiplier,
        maxHp: local.maxHp, moveSpeedMultiplier: local.moveSpeedMultiplier, radius: local.radius,
        hpRegenPerSec: local.hpRegenPerSec, collectedPerks: local.collectedPerks,
      },
    } satisfies PlayerUpdateMessage)

  } else if (msg.type === 'try_purchase_upgrade') {
    const node = UPGRADE_NODES.get(msg.nodeId)
    let success = false
    if (node && !local.purchasedUpgrades.includes(msg.nodeId) && node.parents.every(pid => local.purchasedUpgrades.includes(pid))) {
      const gemCost = node.cost.find(c => c.currency === 'gem')?.amount ?? 0
      if (local.gems >= gemCost) {
        local.gems -= gemCost
        local.purchasedUpgrades = [...local.purchasedUpgrades, msg.nodeId]
        success = true
        await Promise.all([saveOfflineGems(local.gems), saveOfflineUpgrades(local.purchasedUpgrades)])
      }
    }

    emit({
      type: 'purchase_result', success, nodeId: msg.nodeId,
      gems: local.gems, purchasedUpgrades: local.purchasedUpgrades,
    } satisfies PurchaseResultMessage)

    if (success) {
      refreshStats(local, local.purchasedUpgrades)
      emit({
        type: 'player_update', id: localId,
        changes: {
          drillType: local.drillType, drillLengthMultiplier: local.drillLengthMultiplier, drillDmgMultiplier: local.drillDmgMultiplier,
          maxHp: local.maxHp, moveSpeedMultiplier: local.moveSpeedMultiplier, radius: local.radius,
          hpRegenPerSec: local.hpRegenPerSec, collectedPerks: local.collectedPerks,
        },
      } satisfies PlayerUpdateMessage)
    }

  } else if (msg.type === 'request_perk_choices') {
    if (!local.state.alive) return
    const pendingPerksCount = Math.min(currentLevel(local.state.xp), local.maxLevel) - local.collectedPerks.length
    if (pendingPerksCount <= 0) return
    const choices = rollPerkChoices(local.collectedPerks)
    local.pendingPerkChoices = choices
    emit({ type: 'perk_options', perkOptions: choices })

  } else if (msg.type === 'claim_quest') {
    // Offline mode has no quest tracking (App.tsx never populates quests offline) — no-op.
  }
}

// ============================================================
// Reacting to events produced by runTick
// ============================================================

function handleClientEvent(e: GameEvent) {
  switch (e.kind) {
    case 'player_killed': {
      const victim = players.get(e.victimId)

      emit({
        type: 'player_killed', killerId: e.killerId, victimId: e.victimId,
        victimName: e.victimName, killerName: e.killerName, gemsAwarded: e.gemsAwarded,
      } satisfies PlayerKilledMessage)

      if (victim && victim.state.id === localId) {
        emit({ type: 'death_screen', killerName: e.killerName, cause: e.cause } satisfies DeathScreenMessage)
      }

      if (e.killerId === localId && e.gemsAwarded > 0) {
        const local = players.get(localId)
        if (local) saveOfflineGems(local.gems += e.gemsAwarded)
      }
      break
    }
    case 'square_killed': {
      break
    }
    case 'bot_spawned': {
      emit({
        type: 'player_respawn', id: e.id, name: e.name, bodyColor: e.bodyColor, borderColor: e.borderColor,
        xpMultiplier: e.xpMultiplier, maxLevel: e.maxLevel, maxHp: e.maxHp, hpRegenPerSec: e.hpRegenPerSec,
        moveSpeedMultiplier: e.moveSpeedMultiplier, radius: e.radius, collectedPerks: e.collectedPerks,
        drillType: e.drillType, drillDmgMultiplier: e.drillDmgMultiplier, drillLengthMultiplier: e.drillLengthMultiplier,
      } satisfies ServerRespawnMessage)
      break
    }
  }
}