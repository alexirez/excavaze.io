export function unpackDrillParams(drillParams: number) {
  return {
    drillType: drillParams & 0x7,
    segments: (drillParams >> 3) & 0x7,
  }
}

export function packDrillParams(drillType: number, segments: number): number {
  return (drillType & 0x7) | ((segments & 0x7) << 3)
}