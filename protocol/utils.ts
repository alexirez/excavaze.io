export function unpackDrillParams(drillParams: number) {
  return {
    drillType: drillParams & 0x7,
    segments: (drillParams >> 3) & 0x7,
  }
}

export function packDrillParams(drillType: number, segments: number): number {
  return (drillType & 0x7) | ((segments & 0x7) << 3)
}

// cross product helper method
export function sign(p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number): number {
  return (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y)
}

// return true if the first point is in the second
export function pointInTriangle(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  const d1 = sign(px, py, ax, ay, bx, by)
  const d2 = sign(px, py, bx, by, cx, cy)
  const d3 = sign(px, py, cx, cy, ax, ay)
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0)
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0)
  return !(hasNeg && hasPos)
}

// rotate a local-space point by angle and translate to world space
export function toWorld(lx: number, ly: number, originX: number, originY: number, cos: number, sin: number): [number, number] {
  return [
    originX + lx * cos - ly * sin,
    originY + lx * sin + ly * cos,
  ]
}