import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { WebSocketServer, WebSocket } from 'ws'
import { ServerPlayer, ServerSquare } from './entities'
import { WorldStateMessage, ClientMessage } from '../../protocol/messages'
import { TICK_MS, WORLD_WIDTH, WORLD_HEIGHT, WORLD_PADDING, PLAYER_BASE_HP, SQUARE_BASE_HP, PLAYER_COLLISION_DAMAGE, KILL_SQUARE_XP_MULTIPLIER, SQR_COLLISION_BASE_DMG, SQR_COLLISION_DMG_FACTOR, COLLISION_COOLDOWN, PLAYER_BASE_RADIUS, PLAYER_BASE_SPEED, CHUNK_ROWS, CHUNK_COLS, SHIELD_DURATION } from '../../protocol/constants'
import { PlayerState, SquareState } from '../../protocol/types'
import { computeBotInput } from '../../protocol/bot-behavior'
import { isDrillPerk, PERK_EFFECTS, PERK_TREE, removeDrillPerks, rollPerkChoices } from '../../protocol/data/perks'
import { assignNextPlayerId, fillMapSquares, getChunkIndex, getNearbySquareIds, pickPlayerSpawnPoint, spawnBots, spawnSquaresOnStartup } from '../../protocol/world'
import { awardXp, circleIntersectsOrientedRect, getDrillDamageOnCircle, getDrillDamageOnRect, getDrillReach, killPlayer, killPlayerBySquare } from '../../protocol/combat'
import { currentLevel, refreshStats } from '../../protocol/utils'
import { identifyPlayer } from './db/guests'
import { purchaseUpgrade } from './db/transactions'
import { refreshQuestsIfNeeded, getPlayerQuests, tickQuestProgress, completeQuestInstantly, claimQuest } from './db/quests'
import { QUEST_TEMPLATE_MAP } from '../../protocol/data/quests'

const PORT = 3000
const SQUARE_SPEED = 0.5
let tick = 0
const TICKS_PER_SECOND = Math.round(1000 / TICK_MS)
const QUEST_CHECK_INTERVAL_TICKS = Math.max(1, Math.round(TICKS_PER_SECOND / 4))

const wss = new WebSocketServer({ port: PORT })
console.log(`Server running on ws://localhost:${PORT}\n`)

const players = new Map<number, ServerPlayer>()
const squares = new Map<number, ServerSquare>()
const playerStates: PlayerState[] = []
const squareStates: SquareState[] = []
const nearbyPlayers: ServerPlayer[] = []
const nearbySquareIds: number[] = []
const squaresToDelete: number[] = []
const chunkToSquares = new Map<number, Set<number>>()
for (let i = 0; i < CHUNK_ROWS * CHUNK_COLS; i++)
  chunkToSquares.set(i, new Set())
const cameraX = Math.random() * WORLD_WIDTH; const cameraY = Math.random() * WORLD_HEIGHT

spawnSquaresOnStartup(squares, chunkToSquares)

wss.on('connection', (socket) => {
  const id = assignNextPlayerId()
  console.log(`${'\x1b[32m'}Player ${id} connected${'\x1b[0m'}`)

  players.set(id, {
    socket,
    state: {
      id,
      xp: 0,
      alive: false,
      shieldActive: false,
      x: 0,
      y: 0,
      rotation: 0,
      hp: PLAYER_BASE_HP,
    },
    name: 'Player',
    bodyColor: 0xff6b6b,
    borderColor: 0xcc4444,
    xpMultiplier: 1,
    maxLevel: 7,
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
    timeAlive: 0,
    wanderAngle: Math.random() * Math.PI * 2,
    gems: 0,
    activeQuests: [],
    purchasedUpgrades: [],
    pendingPerkChoices: []
  })
  for (const other of players.values()) {
    if (!other.state.alive) continue
    socket.send(JSON.stringify({
      type: 'player_respawn',
      id: other.state.id,
      name: other.name,
      bodyColor: other.bodyColor,
      borderColor: other.borderColor,
      xpMultiplier: other.xpMultiplier,
      maxLevel: other.maxLevel,
      maxHp: other.maxHp,
      hpRegenPerSec: other.hpRegenPerSec,
      moveSpeedMultiplier: other.moveSpeedMultiplier,
      radius: other.radius,
      collectedPerks: other.collectedPerks,
      drillType: other.drillType,
      drillDmgMultiplier: other.drillDmgMultiplier,
      drillLengthMultiplier: other.drillLengthMultiplier,
    }))
  }

  socket.on('close', (code, reason) => {
    players.delete(id)
    console.log(`${'\x1b[31m'}Player ${id} disconnected${'\x1b[0m'}  ${'\x1b[2m'}code: ${code}  reason: ${reason.toString() || '—'}${'\x1b[0m'}`)
    })

  socket.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientMessage
      if (msg.type === 'input') {
        players.get(id)!.input = {
          dx: msg.dx,
          dy: msg.dy,
          rotation: msg.rotation,
        }
      } else if (msg.type === 'guest_login') {
        const p = players.get(id)!
        if (p.dbId) return // already identified this connection, ignore duplicate

        const { record, isNewGuest } = await identifyPlayer(msg.token)
        p.dbId = record.dbId
        p.guestToken = record.guestToken
        p.gems = record.gems
        p.purchasedUpgrades = record.purchasedUpgrades

        await refreshQuestsIfNeeded(record.dbId)
        const quests = await getPlayerQuests(record.dbId)
        p.activeQuests = quests
          .filter(q => q.status === 'active')
          .map(q => ({ instanceId: q.id, questId: q.questId, progress: q.progress }))

        socket.send(JSON.stringify({
          type: 'player_quests',
          quests: quests.map(q => ({ instanceId: q.id, questId: q.questId, status: q.status, progress: q.progress })),
        }))

        socket.send(JSON.stringify({
          type: 'welcome', id,
          gems: record.gems, upgrades: record.purchasedUpgrades,
          cameraX, cameraY,
        }))

        if (isNewGuest)
          socket.send(JSON.stringify({ type: 'assign_guest_token', token: record.guestToken }))
      } else if (msg.type === 'client_respawn') {
        const p = players.get(id)!
        if (p.state.alive) return
        const { x, y } = pickPlayerSpawnPoint(players)
        p.name = msg.name
        p.bodyColor = msg.bodyColor
        p.borderColor = msg.borderColor
        p.state.xp *= 0.8
        p.state.alive = true
        p.timeAlive = 0
        p.state.shieldActive = true
        p.state.x = x
        p.state.y = y
        p.collectedPerks = []
        p.shieldTicks = SHIELD_DURATION
        p.purchasedUpgrades = msg.upgrades ?? []
        refreshStats(p, p.purchasedUpgrades)
        p.state.hp = p.maxHp // needed for max hp upgrades

        const respawnMsg = JSON.stringify({
          type: 'player_respawn',
          id,
          name: p.name,
          bodyColor: p.bodyColor,
          borderColor: p.borderColor,
          xpMultiplier: p.xpMultiplier,
          maxLevel: p.maxLevel,
          maxHp: p.maxHp,
          hpRegenPerSec: p.hpRegenPerSec,
          moveSpeedMultiplier: p.moveSpeedMultiplier,
          radius: p.radius,
          collectedPerks: p.collectedPerks,
          drillType: p.drillType,
          drillDmgMultiplier: p.drillDmgMultiplier,
          drillLengthMultiplier: p.drillLengthMultiplier,
        })
        for (const other of players.values()) {
          if (other.socket?.readyState === WebSocket.OPEN)
            other.socket.send(respawnMsg)
        }
      } else if (msg.type === 'select_perk') {
        const player = players.get(id)!
        if (!player.state.alive) return
        if (!player.pendingPerkChoices.includes(msg.perkId)) return
        player.pendingPerkChoices = []
        const perk = PERK_TREE[msg.perkId]
        if (!perk) return
        if (player.collectedPerks.includes(msg.perkId)) return
        if (isDrillPerk(msg.perkId)) removeDrillPerks(player)
        player.collectedPerks.push(msg.perkId)
        refreshStats(player, player.purchasedUpgrades)
        PERK_EFFECTS[msg.perkId]?.(player) // one-time, not recalculated
        const updateMsg = JSON.stringify({
          type: 'player_update',
          id,
          changes: {
            drillType: player.drillType,
            drillLengthMultiplier: player.drillLengthMultiplier,
            drillDmgMultiplier: player.drillDmgMultiplier,
            maxHp: player.maxHp,
            moveSpeedMultiplier: player.moveSpeedMultiplier,
            radius: player.radius,
            hpRegenPerSec: player.hpRegenPerSec,
            collectedPerks: player.collectedPerks,
          }
        })
        for (const other of players.values()) {
          if (other.socket?.readyState === WebSocket.OPEN)
            other.socket.send(updateMsg)
        }
      } else if (msg.type === 'try_purchase_upgrade') {
        const p = players.get(id)!
        if (!p.dbId) return // not identified yet, ignore

        const result = await purchaseUpgrade(p.dbId, msg.nodeId)
        p.gems = result.gems
        p.purchasedUpgrades = result.purchasedUpgrades

        socket.send(JSON.stringify({
          type: 'purchase_result', success: result.success, nodeId: msg.nodeId,
          gems: result.gems, purchasedUpgrades: result.purchasedUpgrades,
        }))

        if (result.success) {
          refreshStats(p, p.purchasedUpgrades)
          const updateMsg = JSON.stringify({
            type: 'player_update',
            id,
            changes: {
              drillType: p.drillType,
              drillLengthMultiplier: p.drillLengthMultiplier,
              drillDmgMultiplier: p.drillDmgMultiplier,
              maxHp: p.maxHp,
              moveSpeedMultiplier: p.moveSpeedMultiplier,
              radius: p.radius,
              hpRegenPerSec: p.hpRegenPerSec,
              collectedPerks: p.collectedPerks,
            }
          })
          for (const other of players.values()) {
            if (other.socket?.readyState === WebSocket.OPEN)
              other.socket.send(updateMsg)
          }
        }
      } else if (msg.type === 'request_perk_choices') {
        const player = players.get(id)!
        if (!player.state.alive) return
        const pendingPerksCount = Math.min(currentLevel(player.state.xp), player.maxLevel) - player.collectedPerks.length
        if (pendingPerksCount <= 0) return
        const choices = rollPerkChoices(player.collectedPerks)
        player.pendingPerkChoices = choices
        player.socket?.send(JSON.stringify({ type: 'perk_options', perkOptions: choices }))
      } else if (msg.type === 'claim_quest') {
        const p = players.get(id)!
        if (!p.dbId) return

        const result = await claimQuest(p.dbId, msg.instanceId)
        if (result.success) {
          p.activeQuests = p.activeQuests.filter(q => q.instanceId !== msg.instanceId)
          if (result.promotedInstanceId && result.promotedQuestId) {
            p.activeQuests.push({ instanceId: result.promotedInstanceId, questId: result.promotedQuestId, progress: 0 })
          }
        }

        socket.send(JSON.stringify({
          type: 'quest_claimed', success: result.success, instanceId: msg.instanceId, gems: result.gems, 
          promotedQuestId: result.promotedQuestId, promotedInstanceId: result.promotedInstanceId,
        }))
      }
    } catch (e) {
      console.error('[connection handler crash]', e)
    }
  })
})

setInterval(() => {
  try {
    tick++

    // 1) Process player/bots input
    for (const p of players.values()) {
      if (!p.state.alive) continue
      p.state.x = Math.max(WORLD_PADDING, Math.min(WORLD_WIDTH - WORLD_PADDING, p.state.x + p.input.dx * p.moveSpeedMultiplier * PLAYER_BASE_SPEED))
      p.state.y = Math.max(WORLD_PADDING, Math.min(WORLD_HEIGHT - WORLD_PADDING, p.state.y + p.input.dy * p.moveSpeedMultiplier * PLAYER_BASE_SPEED))
      p.state.rotation = p.input.rotation

      // 2) Process spawn shield timer, timeAlive, hp regen
      if (p.shieldTicks > 0) {
        p.shieldTicks-- 
        if (p.shieldTicks <= 0) p.state.shieldActive = false
      }
      if (p.state.alive) p.timeAlive += TICK_MS
      p.state.hp = Math.min(p.state.hp + p.hpRegenPerSec, p.maxHp)
    }
    
    // 3) Check for collisions
      for (const [idA, a] of players) { // 1. player to player collisions
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
            if (b.state.hp <= 0 ) { killPlayer(a, b, 'player', players); incrementQuestProgress(a, 'kill_player', 1) }
            if (a.state.hp <= 0 ) { killPlayer(b, a, 'player', players); incrementQuestProgress(b, 'kill_player', 1) }
          }
        }
      }

        for (const [idA, a] of players) { // 2. player + drill collisions
          if (!a.state.alive) continue
          const aReach = getDrillReach(a)
          for (const [idB, b] of players) {
            if (!b.state.alive || idA === idB || b.state.shieldActive) continue
            const dx = a.state.x - b.state.x
            const dy = a.state.y - b.state.y
            if (dx*dx + dy*dy > (aReach + b.radius) ** 2) continue // broadphase
            b.state.hp -= getDrillDamageOnCircle(
              a.state.x, a.state.y, a.state.rotation, a.radius, 
              a.drillType, a.drillLengthMultiplier, a.drillDmgMultiplier,
              b.state.x, b.state.y, b.radius
            )
            if (b.state.hp <= 0) { killPlayer(a, b, 'drill', players); incrementQuestProgress(a, 'kill_player', 1) }
          }
        }

    for (const p of players.values()) {
      if (!p.state.alive) continue
      const chunkIndex = getChunkIndex(p.state.x, p.state.y)
      getNearbySquareIds(chunkToSquares, chunkIndex, nearbySquareIds) // only consider 9 nearest chunks for efficient collision checking
      const drillReach = getDrillReach(p)

      for (const id of nearbySquareIds) {

        const square = squares.get(id) 
        if (!square) continue
        const dx = p.state.x - square.state.x
        const dy = p.state.y - square.state.y
        const sqrDist = dx * dx + dy * dy

        if (sqrDist > (drillReach + square.boundingRadius )**2) continue

        const sqSize = 20 + (square.state.maxHp / SQUARE_BASE_HP) * 10 // 3. drill + square collisions
        const sqHalf = sqSize / 2

        square.state.hp -= getDrillDamageOnRect(
          p.state.x, p.state.y, p.state.rotation, p.radius,
          p.drillType, p.drillLengthMultiplier, p.drillDmgMultiplier,
          square.state.x, square.state.y, square.state.rotation, sqHalf, sqHalf
        )
        if (square.state.hp <= 0) {
          awardXp(p, KILL_SQUARE_XP_MULTIPLIER * square.state.maxHp)
          incrementQuestProgress(p, 'kill_square', 1)
        }

        if (circleIntersectsOrientedRect(
          p.state.x, p.state.y, p.radius,
          square.state.x, square.state.y, square.state.rotation, sqHalf, sqHalf // 4. player + square collisions
        )) {
          square.state.hp -= PLAYER_COLLISION_DAMAGE
          if (square.state.hp <= 0) {
            awardXp(p, KILL_SQUARE_XP_MULTIPLIER * square.state.maxHp)
            incrementQuestProgress(p, 'kill_square', 1)
          }
          if (!p.state.shieldActive && Date.now() - p.lastCollisionTime > COLLISION_COOLDOWN) {
            p.state.hp -= SQR_COLLISION_BASE_DMG + square.state.maxHp * SQR_COLLISION_DMG_FACTOR
            p.lastCollisionTime = Date.now()
          }
          if (p.state.hp <= 0) killPlayerBySquare(p, players)
        }
      }
    }

    // 4) Handle quest progress for players
    for (const p of players.values()) {
      if (p.socket === null) continue
      if (p.state.id % QUEST_CHECK_INTERVAL_TICKS === tick % QUEST_CHECK_INTERVAL_TICKS)
        tryCompleteSingleRunQuests(p)
    }

    // 5) Prepare bots' input for next tick
    if (tick % 3 === 0) {
      for (const p of players.values()) {
        if (p.socket !== null || !p.state.alive) continue
        nearbyPlayers.length = 0
        for (const [id, other] of players) {
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
    if (tick % 50 === 0) spawnBots(players, cameraX, cameraY)

    // 7) Process each active square
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

    // 8) Recompute squares in each chunk
    for (const set of chunkToSquares.values()) set.clear()
    for (const [id, square] of squares) {
      const index = getChunkIndex(square.state.x, square.state.y)
      chunkToSquares.get(index)?.add(id)
    }

    // 9) Spawn new obstacles to replace old
    if (tick % 10 === 0) {
      fillMapSquares(squares, chunkToSquares, players)
    }

    // 10) Serialize world state and send to every connected client
    playerStates.length = 0
    squareStates.length = 0
    for (const p of players.values()) if (p.state.alive) playerStates.push(p.state)
    for (const sq of squares.values()) squareStates.push(sq.state)
    const message: WorldStateMessage = {
      type: 'world_state',
      players: playerStates,
      squares: squareStates,
    }

    const json = JSON.stringify(message)
    for (const p of players.values()) {
      if (p.socket && p.socket.readyState === WebSocket.OPEN)
        p.socket.send(json)
    }
  } catch (e) {
    console.error('[tick crash]', e)
  }
}, TICK_MS)

function incrementQuestProgress(player: ServerPlayer, event: string, amount: number) {
  if (!player.dbId) return
  for (const q of player.activeQuests) {
    const template = QUEST_TEMPLATE_MAP.get(q.questId)
    if (!template || template.event !== event) continue
    const wasComplete = q.progress >= template.target
    q.progress += amount
    player.socket?.send(JSON.stringify({ type: 'quest_progress', instanceId: q.instanceId, progress: q.progress }))
    if (!wasComplete && q.progress >= template.target) {
      player.socket?.send(JSON.stringify({ type: 'quest_completed', instanceId: q.instanceId }))
    }
  }
  tickQuestProgress(player.dbId, event, amount).catch(e => console.error('[tickQuestProgress failed]', e))
}

const SINGLE_RUN_VALUE_GETTERS: Record<string, (player: ServerPlayer) => number> = {
  survive_duration: (p) => p.timeAlive / 1000,
  reach_xp: (p) => p.state.xp,
  reach_level: (p) => currentLevel(p.state.xp)
}

function tryCompleteSingleRunQuests(player: ServerPlayer) {
  if (!player.dbId) return
  for (const q of player.activeQuests) {
    const template = QUEST_TEMPLATE_MAP.get(q.questId)
    if (!template) continue
    const getValue = SINGLE_RUN_VALUE_GETTERS[template.event]
    if (!getValue) continue
    if (getValue(player) < template.target) continue

    tickQuestProgress(player.dbId, q.instanceId, template.target)
  }
}