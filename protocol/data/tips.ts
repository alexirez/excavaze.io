const TIPS_PLAYER = [
  "Tip: Ramming into other players deals damage to both of you.",
  "Tip: Avoid large players!.",
]
const TIPS_DRILL = [
  "Tip: Your drill length can be upgraded to reach enemies from a safer distance.",
  "Tip: Avoid large players!.",
  "Tip: Upgrade your speed to escape hostile players",
]
const TIPS_SQUARE = [
  "Tip: Bigger squares deal more damage.",
  "Tip: Some areas are more dense than others. Dense areas are more dangerous.",
  "You died to a square? Seriously?",
]
const TIPS_GENERAL = [
  "Tip: Your player level in battle is limited based on the Max Level upgrade. Purchase upgrades to get stronger!",
  "Tip: Larger squares give more xp.",
]

export function pickTip(cause: 'player' | 'drill' | 'square'): string {
  if (Math.random() < 0.2)
    return TIPS_GENERAL[Math.floor(Math.random() * TIPS_GENERAL.length)]
  const pools = { player: TIPS_PLAYER, drill: TIPS_DRILL, square: TIPS_SQUARE }
  const pool = pools[cause]
  return pool[Math.floor(Math.random() * pool.length)]
}