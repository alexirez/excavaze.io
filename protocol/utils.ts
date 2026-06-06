
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

export function toWorld(lx: number, ly: number, originX: number, originY: number, cos: number, sin: number): [number, number] {
  return [
    originX + lx * cos - ly * sin,
    originY + lx * sin + ly * cos,
  ]
}