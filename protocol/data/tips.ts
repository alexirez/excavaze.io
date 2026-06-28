const TIPS_PLAYER = [
  'Tip: Ramming into other players deals damage to both of you.',
  'Tip: Avoid large players!.',
]
const TIPS_DRILL = [
  'Tip: Your drill length can be upgraded to reach enemies from a safer distance.',
  'Tip: Avoid large players!.',
  'Tip: Upgrade your speed to escape hostile players',
]
const TIPS_SQUARE = [
  'Tip: Bigger squares deal more damage.',
  'Tip: Some areas are more dense than others. Dense areas are more dangerous.',
  'You died to a square? Seriously?',
]
const TIPS_GENERAL = [
  'Tip: Your player level in battle is limited based on the Max Level upgrade. Purchase upgrades to get stronger!',
  'Tip: Larger squares give more xp.',
  'Want to top the leaderboards? Gain xp faster with the XP upgrade!',
  'Tip: Spawn points are based on distance from enemies. You\'ll rarely spawn next to another player.',
  'Tip: Higher level squares are usually found deeper in the map.',
  'Dying is just a free respawn with extra steps.',
  'Offline or online, which will you pick?',
  'Tip: Avoid large players!.',
  'Tip: Bigger squares deal more damage.',
  'Tip: Don\'t worry if you die, you\'ll keep most of your xp.',
]

export function pickTip(cause: 'general' | 'player' | 'drill' | 'square'): string {
  const pools = { general: TIPS_GENERAL, player: TIPS_PLAYER, drill: TIPS_DRILL, square: TIPS_SQUARE }
  const pool = pools[cause]
  return pool[Math.floor(Math.random() * pool.length)]
}

export function stripTipPrefix(tip: string): string {
  return tip.startsWith('Tip: ') ? tip.slice(5) : tip
}