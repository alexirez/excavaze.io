
export interface ColorCombo {
  label: string
  bodyColor: number
  borderColor: number
}

export const COLOR_COMBOS: Record<string, ColorCombo> = {
  crimson: { label: 'Crimson', bodyColor: 0xff6b6b, borderColor: 0xcc4444 },
  skyblue: { label: 'Skyblue', bodyColor: 0x4dabf7, borderColor: 0x1c6dc4 },
  mint: { label: 'Mint', bodyColor: 0x69db7c, borderColor: 0x2f9e44 },
  amber: { label: 'Amber', bodyColor: 0xffd43b, borderColor: 0xf08c00 },
  violet: { label: 'Violet', bodyColor: 0xb197fc, borderColor: 0x7048e8 },
  tangerine: { label: 'Tangerine', bodyColor: 0xff922b, borderColor: 0xd9480f },
  teal: { label: 'Teal', bodyColor: 0x66d9e8, borderColor: 0x1098ad },
  blush: { label: 'Blush', bodyColor: 0xf783ac, borderColor: 0xc2255c },
}

const comboKeys = Object.keys(COLOR_COMBOS)

export function pickRandomColorCombo(): ColorCombo {
  const key = comboKeys[Math.floor(Math.random() * comboKeys.length)]
  return COLOR_COMBOS[key]
}