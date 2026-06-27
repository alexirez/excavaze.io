import { ServerPlayer } from "../server/src/entities"
import { KILL_PLAYER_BASE_XP, STEAL_PLAYER_XP_MULTIPLIER } from "./constants"
import { DeathScreenMessage, PlayerKilledMessage } from "./messages"
import { PlayerState } from "./types"
import { circleIntersectsTriangle, currentLevel, xpForLevel } from "./utils"

export function getDrillReach(state: PlayerState): number {
  switch (state.drillType) {
    case 0: return state.radius + 40 * state.drillLengthMultiplier
    case 1: return state.radius + 40 * state.drillLengthMultiplier
    case 2: return state.radius + 30 + 30 * state.drillLengthMultiplier + 25 + 2 * state.drillLengthMultiplier
    case 3: return state.radius + 40 + 40 * state.drillLengthMultiplier + 80
    default: return state.radius
  }
}

export function getDrillDamageOnCircle(originX: number, originY: number, rotation: number,
  radius: number, drillType: number, drillLengthMultiplier: number, drillDmgMultiplier: number, 
  targetX: number, targetY: number, targetRadius: number): number {
  switch (drillType) {
    case 0: return getStackedTrianglesDrillDamage(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, targetX, targetY, targetRadius)
    case 1: return getSingleTriangleDrillDamage(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, targetX, targetY, targetRadius)
    case 2: return getSawbladeDrillDamage(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, targetX, targetY, targetRadius)
    case 3: return getDeathbladeDrillDamage(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, targetX, targetY, targetRadius)
    default: return 0
  }
}

export function getDrillDamageOnRect(
  originX: number, originY: number, rotation: number,
  radius: number, drillType: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): number {
  switch (drillType) {
    case 0: return stackedTrianglesDmgOnRect(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, rx, ry, rRotation, rHalfW, rHalfH)
    case 1: return singleTriangleDmgOnRect(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, rx, ry, rRotation, rHalfW, rHalfH)
    case 2: return sawbladeDmgOnRect(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, rx, ry, rRotation, rHalfW, rHalfH)
    case 3: return deathbladeDmgOnRect(originX, originY, rotation, radius, drillLengthMultiplier, drillDmgMultiplier, rx, ry, rRotation, rHalfW, rHalfH)
    default: return 0
  }
}

function stackedTrianglesDmgOnRect(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): number {
  const segments = 5
  const totalLength = 40 * drillLengthMultiplier
  const segmentLength = totalLength / segments
  const startX = radius
  const baseWidth = 25
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  for (let i = 0; i < segments; i++) {
    const x = startX + i * segmentLength
    const width = baseWidth * (1 - i / segments)
    const x0 = x - segmentLength * 0.3
    const x1 = x + segmentLength

    const halfW = width / 2
    const ax = originX + x0 * cos - (-halfW) * sin
    const ay = originY + x0 * sin + (-halfW) * cos
    const bx = originX + x0 * cos -   halfW  * sin
    const by = originY + x0 * sin +   halfW  * cos
    const cx = originX + x1 * cos
    const cy = originY + x1 * sin

    if (triangleIntersectsOrientedRect(ax, ay, bx, by, cx, cy, rx, ry, rRotation, rHalfW, rHalfH)) {
      return 15 * drillDmgMultiplier
    }
  }
  return 0
}

function singleTriangleDmgOnRect(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): number {
  const startX = radius
  const width = 10
  const height = 40 * drillLengthMultiplier
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  const ax = originX + startX * cos - (-width) * sin
  const ay = originY + startX * sin + (-width) * cos
  const bx = originX + startX * cos -   width  * sin
  const by = originY + startX * sin +   width  * cos
  const cx = originX + (startX + height) * cos
  const cy = originY + (startX + height) * sin

  if (triangleIntersectsOrientedRect(ax, ay, bx, by, cx, cy, rx, ry, rRotation, rHalfW, rHalfH)) {
    return 15 * drillDmgMultiplier
  }
  return 0
}

function getStackedTrianglesDrillDamage(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  targetX: number, targetY: number, targetRadius: number
): number {
  const segments = 5
  const totalLength = 40 * drillLengthMultiplier
  const segmentLength = totalLength / segments
  const startX = radius
  const baseWidth = 25
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  for (let i = 0; i < segments; i++) {
    const x = startX + i * segmentLength
    const width = baseWidth * (1 - i / segments)
    const x0 = x - segmentLength * 0.3
    const x1 = x + segmentLength

    const halfW = width / 2
    const ax = originX + x0 * cos - (-halfW) * sin
    const ay = originY + x0 * sin + (-halfW) * cos
    const bx = originX + x0 * cos -   halfW  * sin
    const by = originY + x0 * sin +   halfW  * cos
    const cx = originX + x1 * cos
    const cy = originY + x1 * sin

    if (circleIntersectsTriangle(targetX, targetY, targetRadius, ax, ay, bx, by, cx, cy)) {
      return 15 * drillDmgMultiplier
    }
  }
  return 0
}

function getSingleTriangleDrillDamage(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  targetX: number, targetY: number, targetRadius: number
): number {
  const startX = radius
  const width = 10
  const height = 40 * drillLengthMultiplier
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)

  const ax = originX + startX * cos - (-width) * sin
  const ay = originY + startX * sin + (-width) * cos
  const bx = originX + startX * cos -   width  * sin
  const by = originY + startX * sin +   width  * cos
  const cx = originX + (startX + height) * cos
  const cy = originY + (startX + height) * sin

  if (circleIntersectsTriangle(targetX, targetY, targetRadius, ax, ay, bx, by, cx, cy)) {
    return 15 * drillDmgMultiplier
  }
  return 0
}

function getSawbladeDrillDamage(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  targetX: number, targetY: number, targetRadius: number
): number {
  const offset = radius + 30 + 30 * drillLengthMultiplier
  const bladeX = originX + Math.cos(rotation) * offset
  const bladeY = originY + Math.sin(rotation) * offset
  const bladeRadius = 20 + 2 * drillLengthMultiplier
  const dx = targetX - bladeX, dy = targetY - bladeY
  return dx*dx + dy*dy < (bladeRadius + targetRadius) ** 2 ? 20 * drillDmgMultiplier : 0
}

function getDeathbladeDrillDamage(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  targetX: number, targetY: number, targetRadius: number
): number {
  const offset = radius + 40 + 40 * drillLengthMultiplier
  const bladeX = originX + Math.cos(rotation) * offset
  const bladeY = originY + Math.sin(rotation) * offset
  const dx = targetX - bladeX, dy = targetY - bladeY
  return dx*dx + dy*dy < (80 + targetRadius) ** 2 ? 20 * drillDmgMultiplier : 0
}

function sawbladeDmgOnRect(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): number {
  const offset = radius + 25 + 25 * drillLengthMultiplier
  const bladeX = originX + Math.cos(rotation) * offset
  const bladeY = originY + Math.sin(rotation) * offset
  const bladeRadius = 22 + 2 * drillLengthMultiplier
  return circleIntersectsOrientedRect(bladeX, bladeY, bladeRadius, rx, ry, rRotation, rHalfW, rHalfH) ? 20 * drillDmgMultiplier : 0
}

function deathbladeDmgOnRect(
  originX: number, originY: number, rotation: number,
  radius: number, drillLengthMultiplier: number, drillDmgMultiplier: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): number {
  const offset = radius + 40 + 40 * drillLengthMultiplier
  const bladeX = originX + Math.cos(rotation) * offset
  const bladeY = originY + Math.sin(rotation) * offset
  return circleIntersectsOrientedRect(bladeX, bladeY, 80, rx, ry, rRotation, rHalfW, rHalfH) ? 20 * drillDmgMultiplier : 0
}

// returns whether or not circle is inside of the rectangle
export function circleIntersectsOrientedRect(
  cx: number, cy: number, circleRadius: number,  // circle
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number  // rect
): boolean {
  // transform circle center into rect local space
  const cos = Math.cos(-rRotation)
  const sin = Math.sin(-rRotation)
  const dx = cx - rx
  const dy = cy - ry
  const localX = dx * cos - dy * sin
  const localY = dx * sin + dy * cos

  // find closest point on AABB to circle center
  const closestX = Math.max(-rHalfW, Math.min(rHalfW, localX))
  const closestY = Math.max(-rHalfH, Math.min(rHalfH, localY))

  // check distance
  const distX = localX - closestX
  const distY = localY - closestY
  return distX * distX + distY * distY < circleRadius * circleRadius
}

function triangleIntersectsOrientedRect(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number,
  rx: number, ry: number, rRotation: number, rHalfW: number, rHalfH: number
): boolean {
  const cos = Math.cos(-rRotation)
  const sin = Math.sin(-rRotation)

  // transform triangle into rect local space (inlined, no tuple allocations)
  let dx = ax - rx, dy = ay - ry
  const lax = dx * cos - dy * sin, lay = dx * sin + dy * cos
  dx = bx - rx; dy = by - ry
  const lbx = dx * cos - dy * sin, lby = dx * sin + dy * cos
  dx = cx - rx; dy = cy - ry
  const lcx = dx * cos - dy * sin, lcy = dx * sin + dy * cos

  // test rect axes
  if (Math.max(lax, lbx, lcx) < -rHalfW || Math.min(lax, lbx, lcx) > rHalfW) return false
  if (Math.max(lay, lby, lcy) < -rHalfH || Math.min(lay, lby, lcy) > rHalfH) return false

  // test triangle edge normals (unrolled, no array allocations)
  // edge 0: a->b
  let nx = -(lby - lay), ny = lbx - lax
  let t0 = lax*nx+lay*ny, t1 = lbx*nx+lby*ny, t2 = lcx*nx+lcy*ny
  let triMin = Math.min(t0, t1, t2), triMax = Math.max(t0, t1, t2)
  let r0 = -rHalfW*nx - rHalfH*ny, r1 = rHalfW*nx - rHalfH*ny
  let r2 = -rHalfW*nx + rHalfH*ny, r3 = rHalfW*nx + rHalfH*ny
  if (triMax < Math.min(r0,r1,r2,r3) || Math.max(r0,r1,r2,r3) < triMin) return false

  // edge 1: b->c
  nx = -(lcy - lby); ny = lcx - lbx
  t0 = lax*nx+lay*ny; t1 = lbx*nx+lby*ny; t2 = lcx*nx+lcy*ny
  triMin = Math.min(t0, t1, t2); triMax = Math.max(t0, t1, t2)
  r0 = -rHalfW*nx - rHalfH*ny; r1 = rHalfW*nx - rHalfH*ny
  r2 = -rHalfW*nx + rHalfH*ny; r3 = rHalfW*nx + rHalfH*ny
  if (triMax < Math.min(r0,r1,r2,r3) || Math.max(r0,r1,r2,r3) < triMin) return false

  // edge 2: c->a
  nx = -(lay - lcy); ny = lax - lcx
  t0 = lax*nx+lay*ny; t1 = lbx*nx+lby*ny; t2 = lcx*nx+lcy*ny
  triMin = Math.min(t0, t1, t2); triMax = Math.max(t0, t1, t2)
  r0 = -rHalfW*nx - rHalfH*ny; r1 = rHalfW*nx - rHalfH*ny
  r2 = -rHalfW*nx + rHalfH*ny; r3 = rHalfW*nx + rHalfH*ny
  if (triMax < Math.min(r0,r1,r2,r3) || Math.max(r0,r1,r2,r3) < triMin) return false

  return true
}

export function killPlayer(killer: ServerPlayer, victim: ServerPlayer, cause: 'player' | 'drill', players: Map<number, ServerPlayer>) {
  if (!victim.state.alive) return
  victim.state.alive = false
  awardXp(killer, STEAL_PLAYER_XP_MULTIPLIER * victim.state.xp + KILL_PLAYER_BASE_XP)
  broadcastToAll(JSON.stringify({ // broadcast that victim died
    type: 'player_killed',
    victimId: victim.state.id,
    killerId: killer.state.id,
    victimName: victim.state.name,
    killerName: killer.state.name,
  } satisfies PlayerKilledMessage), players)
  victim.socket?.send(JSON.stringify({
    type: 'death_screen',
    killerName: killer.state.name,
    cause: cause
  } satisfies DeathScreenMessage))
  if (victim.socket === null) players.delete(victim.state.id) // bots are removed immediately
}

export function killPlayerBySquare(victim: ServerPlayer, players: Map<number, ServerPlayer>) {
  if (!victim.state.alive) return
  victim.state.alive = false
  broadcastToAll(JSON.stringify({
    type: 'player_killed',
    victimId: victim.state.id,
    killerId: -1,
    victimName: victim.state.name,
    killerName: 'A Square',
  } satisfies PlayerKilledMessage), players)
  victim.socket?.send(JSON.stringify({
    type: 'death_screen',
    killerName: 'a Square',
    cause: 'square'
  } satisfies DeathScreenMessage))
  if (victim.socket === null) players.delete(victim.state.id) // bots are removed immediately
}

// helper to broadcast a message to all connected players
function broadcastToAll(json: string, players: Map<number, ServerPlayer>) {
  for (const p of players.values()) {
    if (p.socket?.readyState === WebSocket.OPEN)
      p.socket.send(json)
  }
}

export function awardXp(player: ServerPlayer, amount: number) {
  player.state.xp += amount
  // TODO: send level_up message for sound/animation trigger
}