import { ServerPlayer, ServerSquare } from '../server/src/entities'
import { PlayerState, SquareState } from './types'
import { BOT_OBSTACLE_AVOIDANCE_DIST } from './constants'

function seek(from: PlayerState, to: PlayerState): { x: number, y: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.001) return { x: 0, y: 0 }
  return { x: dx / len, y: dy / len }
}

function flee(from: PlayerState, threat: PlayerState): { x: number, y: number } {
  const s = seek(from, threat)
  return { x: -s.x, y: -s.y }
}

function wander(bot: ServerPlayer): { x: number, y: number } {
  bot.wanderAngle += (Math.random() - 0.5) * 0.3
  return { x: Math.cos(bot.wanderAngle), y: Math.sin(bot.wanderAngle) }
}

function computeObstacleAvoidance(bot: PlayerState, nearbySquareIds: number[], squares: Map<number, ServerSquare>): { x: number, y: number } {
  let fx = 0, fy = 0
  for (const id of nearbySquareIds) {
    const sq = squares.get(id)
    if (!sq) continue
    const dx = bot.x - sq.state.x
    const dy = bot.y - sq.state.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > BOT_OBSTACLE_AVOIDANCE_DIST || dist < 0.001) continue
    const strength = Math.pow(1 - dist / BOT_OBSTACLE_AVOIDANCE_DIST, 16)
    fx += (dx / dist) * strength
    fy += (dy / dist) * strength
  }
  const len = Math.sqrt(fx * fx + fy * fy)
  if (len < 0.001) return { x: 0, y: 0 }
  return { x: fx / len, y: fy / len }
}

export function computeBotInput(bot: ServerPlayer, nearbyPlayers: PlayerState[], nearbySquareIds: number[], squares: Map<number, ServerSquare>) {
  let x = 0, y = 0

  // find biggest nearby threat and weakest nearby target
  let threat: PlayerState | null = null
  let target: PlayerState | null = null
  let biggestThreatRadius = bot.state.playerRadius * 1.3
  let bestScore = -1

  for (const p of nearbyPlayers) {
    if (p.id === bot.state.id) continue
    if (p.playerRadius > biggestThreatRadius) { biggestThreatRadius = p.playerRadius; threat = p }
    const currentScore = targetScore(bot, p)
    if (currentScore > bestScore) { bestScore = currentScore; target = p }
  }

  if (threat) {
    const f = flee(bot.state, threat)
    x += f.x * 1.5
    y += f.y * 1.5
  }

  if (target) {
    const s = seek(bot.state, target)
    x += s.x * 0.5
    y += s.y * 0.5
    bot.input.rotation = Math.atan2(target.y - bot.state.y, target.x - bot.state.x)
  } else {
    bot.input.rotation = bot.wanderAngle
  }

  const w = wander(bot)
  x += w.x * 0.3
  y += w.y * 0.3

  const avoid = computeObstacleAvoidance(bot.state, nearbySquareIds, squares)
  x += avoid.x * 1.8
  y += avoid.y * 1.8

  const len = Math.sqrt(x * x + y * y)
  const MOMENTUM = 0.4 // 0 = no smoothing, 1 = never changes
  bot.input.dx = bot.input.dx * MOMENTUM + (len > 0 ? x / len : 0) * (1 - MOMENTUM)
  bot.input.dy = bot.input.dy * MOMENTUM + (len > 0 ? y / len : 0) * (1 - MOMENTUM)
}

function targetScore(bot: ServerPlayer, p: PlayerState): number {
  const hpDeficit = bot.state.hp - p.hp
  const dmgDeficit = bot.state.drillDmgMultiplier - p.drillDmgMultiplier
  const dx = bot.state.x - p.x; const dy = bot.state.y - p.y
  const sqrDist = dx * dx + dy * dy
  return (hpDeficit > 0 ? hpDeficit : 0) * Math.max(0.1, 1 + dmgDeficit) / (sqrDist + 0.001)
}