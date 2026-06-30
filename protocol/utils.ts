import { ServerPlayer } from "../server/src/entities"
import { PLAYER_BASE_HP, PLAYER_BASE_RADIUS } from "./constants"
import { PERK_TREE } from "./data/perks"
import { UPGRADE_NODES } from "./data/upgrade-nodes"
import { PlayerState } from "./types"

export function sign(p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number): number {
  return (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y)
}

export function pointInTriangle(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  const d1 = sign(px, py, ax, ay, bx, by)
  const d2 = sign(px, py, bx, by, cx, cy)
  const d3 = sign(px, py, cx, cy, ax, ay)
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0)
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0)
  return !(hasNeg && hasPos)
}

function pointToSegmentDistSq(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2
}

export function circleIntersectsTriangle(
  cx: number, cy: number, r: number,
  ax: number, ay: number,
  bx: number, by: number,
  cx2: number, cy2: number
): boolean {
  const rSq = r * r
  if (pointInTriangle(cx, cy, ax, ay, bx, by, cx2, cy2)) return true
  if (pointToSegmentDistSq(cx, cy, ax, ay, bx, by) <= rSq) return true
  if (pointToSegmentDistSq(cx, cy, bx, by, cx2, cy2) <= rSq) return true
  if (pointToSegmentDistSq(cx, cy, cx2, cy2, ax, ay) <= rSq) return true
  return false
}

export function currentLevel(xp: number): number {
  return Math.floor(Math.log(1 + xp * 0.1 / 200) / Math.log(1.1))
}

export function xpForLevel(level: number): number {
  return Math.floor(200 * ((Math.pow(1.1, level) - 1) / 0.1))
}

export function xpThisLevel(xp: number): number {
  return xp - xpForLevel(currentLevel(xp))
}

export function xpForNextLevel(xp: number): number {
  return xpForLevel(currentLevel(xp) + 1) - xpForLevel(currentLevel(xp))
}

export function refreshStats(player: ServerPlayer, purchasedUpgrades: string[]) {
  player.xpMultiplier = 1,
  player.maxLevel = 7
  player.maxHp = PLAYER_BASE_HP
  player.hpRegenPerSec = 0
  player.moveSpeedMultiplier = 1
  player.radius = PLAYER_BASE_RADIUS // 1. Reset to base stats before reapplying
  player.drillType = 0
  player.drillDmgMultiplier = 1
  player.drillLengthMultiplier = 1

  for (const upgradeId of purchasedUpgrades) {
    const upgrade = UPGRADE_NODES.get(upgradeId)
    if (upgrade) upgrade.apply(player)
  }

  for (const perkId of player.collectedPerks) { // 3. Apply perks
    const perk = PERK_TREE[perkId]
    if (perk) perk.apply(player)
  }
}