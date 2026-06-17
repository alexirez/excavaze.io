import { ServerPlayer, ServerSquare } from '../server/src/entities'
import { PlayerState, SquareState } from './types'
import { BOT_OBSTACLE_AVOIDANCE_DIST, SQUARE_BASE_HP } from './constants'

const _forces: { x: number, y: number }[] = []

function seek(from: PlayerState, to: PlayerState): { x: number, y: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.001) return { x: 0, y: 0 }
  return { x: dx / len, y: dy / len }
}

function wander(bot: ServerPlayer): { x: number, y: number } {
  bot.wanderAngle += (Math.random() - 0.5) * 0.3
  return { x: Math.cos(bot.wanderAngle), y: Math.sin(bot.wanderAngle) }
}

function computeObstacleAvoidance(bot: PlayerState, nearbySquareIds: number[], squares: Map<number, ServerSquare>): { x: number, y: number } {
  // first pass: collect all force vectors
  _forces.length = 0
  for (const id of nearbySquareIds) {
    const sq = squares.get(id)
    if (!sq) continue
    const sqHalf = (20 + (sq.state.maxHp / SQUARE_BASE_HP) * 10) / 2
    const avoidDist = BOT_OBSTACLE_AVOIDANCE_DIST + bot.playerRadius + sqHalf
    const dx = bot.x - sq.state.x
    const dy = bot.y - sq.state.y
    const dist = Math.sqrt(dx * dx + dy * dy) - bot.playerRadius - sqHalf
    if (dist > avoidDist || dist < 0.001) continue
    const s = Math.max(0, 1 - dist / avoidDist)
    const strength = Math.pow(s, 16)
    _forces.push({ x: (dx / (dist + bot.playerRadius + sqHalf)) * strength, y: (dy / (dist + bot.playerRadius + sqHalf)) * strength })
  }

  if (_forces.length === 0) return { x: 0, y: 0 }

  // second pass: accumulate with similarity penalty
  let fx = _forces[0].x, fy = _forces[0].y

  for (let i = 1; i < _forces.length; i++) {
    const f = _forces[i]
    const fLen = Math.sqrt(f.x * f.x + f.y * f.y)
    if (fLen < 0.001) continue

    // normalize current accumulated vector
    const accLen = Math.sqrt(fx * fx + fy * fy)
    if (accLen < 0.001) { fx += f.x; fy += f.y; continue }

    // dot product — how similar is this force to what we already have?
    const dot = (fx / accLen) * (f.x / fLen) + (fy / accLen) * (f.y / fLen)
    
    // similarity is in [-1, 1]. 1 = same direction, -1 = opposite
    // scale contribution down when similar, keep when different
    const similarity = Math.max(0, dot) // only penalize when pushing same way
    const scale = 1.001 - similarity

    fx += f.x * scale
    fy += f.y * scale
  }

  const len = Math.sqrt(fx * fx + fy * fy)
  if (len < 0.001) return { x: 0, y: 0 }
  return { x: fx / len, y: fy / len }
}

export function computeBotInput(bot: ServerPlayer, nearbyPlayers: PlayerState[], nearbySquareIds: number[], squares: Map<number, ServerSquare>) {
  let x = 0, y = 0

  // find biggest nearby threat and weakest nearby target
  let target: PlayerState | null = null
  let bestScore = -1

  for (const p of nearbyPlayers) {
    if (p.id === bot.state.id) continue
    const currentScore = targetScore(bot, p)
    if (currentScore > bestScore) { bestScore = currentScore; target = p }
  }

  if (target) {
    const s = seek(bot.state, target)
    x += s.x * 1.4
    y += s.y * 1.4
    bot.input.rotation = Math.atan2(target.y - bot.state.y, target.x - bot.state.x)
  } else {
    bot.input.rotation = bot.wanderAngle
  }

  const w = wander(bot)
  x += w.x * 0.3
  y += w.y * 0.3

  const avoid = computeObstacleAvoidance(bot.state, nearbySquareIds, squares)
  x += avoid.x * 1.2
  y += avoid.y * 1.2

  const len = Math.sqrt(x * x + y * y)
  const MOMENTUM = 0.4 // 0 = no smoothing, 1 = never changes
  bot.input.dx = bot.input.dx * MOMENTUM + (len > 0 ? x / len : 0) * (1 - MOMENTUM)
  bot.input.dy = bot.input.dy * MOMENTUM + (len > 0 ? y / len : 0) * (1 - MOMENTUM)
}

function targetScore(bot: ServerPlayer, p: PlayerState): number {
  const hpDeficit = bot.state.hp - p.hp
  const dmgDeficit = bot.state.drillDmgMultiplier - p.drillDmgMultiplier
  const dx = bot.state.x - p.x; const dy = bot.state.y - p.y
  const posDelta = dx * dy
  return (hpDeficit > 0 ? hpDeficit : 0) * Math.max(0.1, 1 + dmgDeficit) / (posDelta**3 + 0.001)
}