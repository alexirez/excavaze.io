import { ServerPlayer } from "../../server/src/entities"
import { PLAYER_BASE_HP, PLAYER_BASE_RADIUS, TICK_MS } from "../constants"

export interface PerkDef {
    title: string
    desc: string
    rarity: Rarity
    requiredPlayerLevel: number
    apply: (p: ServerPlayer) => void
}

export const RARITY_CONFIG = {
  common:    { weight: 59, color: '#ffffff' },
  rare:      { weight: 30,  color: '#da5817' },
  epic:      { weight: 8,   color: '#aa44ff' },
  legendary: { weight: 3,   color: '#ffaa00' },
} as const

type Rarity = keyof typeof RARITY_CONFIG

export const PERK_TREE: Record<string, PerkDef> = {
    'drill_dmg': {
        title: 'Drill DMG+',
        desc: 'Drill DMG +10%',
        rarity: 'common',
        requiredPlayerLevel: 0,
        apply: (p) => { p.drillDmgMultiplier += 0.1 }
    },

    'drill_dmg_2': {
        title: 'Drill DMG++',
        desc: 'Additional +20% drill DMG',
        rarity: 'rare',
        requiredPlayerLevel: 3,
        apply: (p) => { p.drillDmgMultiplier += 0.2 },
    },

    'drill_length': {
        title: 'Drill Length+',
        desc: 'Drill reach +15%',
        rarity: 'common',
        requiredPlayerLevel: 0,
        apply: (p) => { p.drillLengthMultiplier += 0.15 },
    },

    'drill_length_2': {
        title: 'Extended Bit',
        desc: 'Additional drill length +25%',
        rarity: 'rare',
        requiredPlayerLevel: 3,
        apply: (p) => { p.drillLengthMultiplier += 0.25 },
    },

    'move_speed': {
        title: 'Swift Soldier',
        desc: 'Movement speed +10%',
        rarity: 'common',
        requiredPlayerLevel: 0,
        apply: (p) => { p.moveSpeedMultiplier += 0.1 },
    },

    'move_speed_2': {
        title: 'Speedrunner',
        desc: "Additional +30% movement\nMax HP -20%",
        rarity: 'rare',
        requiredPlayerLevel: 4,
        apply: (p) => { p.moveSpeedMultiplier += 0.3; p.maxHp -= PLAYER_BASE_HP * 0.2 },
    },

    'hp_buff': {
        title: 'Tough Guy',
        desc: 'Max HP +20\nPlayer size +20%',
        rarity: 'common',
        requiredPlayerLevel: 1,
        apply: (p) => { p.maxHp += 20; p.radius += PLAYER_BASE_RADIUS * 0.2 },
    },

    'hp_buff_2': {
        title: 'Bastion',
        desc: 'Max HP +60\nPlayer size +50%',
        rarity: 'rare',
        requiredPlayerLevel: 8,
        apply: (p) => { p.maxHp += 60; p.radius += PLAYER_BASE_RADIUS * 0.5 },
    },

    'hp_regen': {
        title: 'Survivor',
        desc: 'Regenerate 2 HP per second',
        rarity: 'rare',
        requiredPlayerLevel: 3,
        apply: (p) => { p.hpRegenPerSec += 2 * TICK_MS / 1000 },
    },

    'hp_regen_2': {
        title: 'Nanobots',
        desc: 'Additional +3 HP regen/sec',
        rarity: 'epic',
        requiredPlayerLevel: 7,
        apply: (p) => { p.hpRegenPerSec += 3 * TICK_MS / 1000 },
    },

    'sawblade': {
        title: 'Sawblade',
        desc: 'Long range\nVery high damage',
        rarity: 'epic',
        requiredPlayerLevel: 10,
        apply: (p) => { p.drillType = 2 },
    },

    'deathblade': {
        title: 'Deathblade',
        desc: 'Giant saw blade\nLower drill DMG\nVery large damage area',
        rarity: 'legendary',
        requiredPlayerLevel: 20,
        apply: (p) => { p.drillType = 3 },
    },
}

export const PERK_TRANSITIONS: Record<string, string[]> = {
  'root':           ['drill_dmg', 'drill_length', 'move_speed', 'hp_buff'],
  'drill_dmg':      ['drill_dmg_2'],
  'drill_length':   ['drill_length_2'],
  'drill_length_2': ['sawblade'],
  'hp_buff':        ['hp_buff_2', 'hp_regen'],
  'hp_regen':       ['hp_regen_2'],
  'move_speed':     ['move_speed_2'],
  'sawblade':       ['deathblade']
}

// one-time side effects to apply upon choosing the perk
export const PERK_EFFECTS: Partial<Record<string, (p: ServerPlayer) => void>> = {
  'hp_buff':   (p) => { p.state.hp += 20 },
  'hp_buff_2': (p) => { p.state.hp += 60 },
}

export const DRILL_PERKS = new Set(['sawblade', 'deathblade'])

export function isDrillPerk(perkId: string): boolean {
  return DRILL_PERKS.has(perkId)
}

export function removeDrillPerks(ServerPlayer: ServerPlayer) {
  ServerPlayer.collectedPerks = ServerPlayer.collectedPerks.filter(
    id => !DRILL_PERKS.has(id)
  )
}

export function rollPerkChoices(collectedPerks: string[]): string[] {
  const collectedSet = new Set(collectedPerks)

  // build pool of unlocked, uncollected perks
  const pool: string[] = []
  for (const [id, transitions] of Object.entries(PERK_TRANSITIONS)) {
    if (id === 'root' || collectedSet.has(id)) {
      for (const next of transitions) {
        if (!collectedSet.has(next)) pool.push(next)
      }
    }
  }

  const unique = [...new Set(pool)] // avoid duplicates

  // pick 3 using rarity weights
    const chosen: string[] = []
    const remaining = [...unique]
    while (chosen.length < 3 && remaining.length > 0) {
    const totalWeight = remaining.reduce((sum, id) => sum + RARITY_CONFIG[PERK_TREE[id].rarity].weight, 0)
    let roll = Math.random() * totalWeight
    for (let i = 0; i < remaining.length; i++) {
        roll -= RARITY_CONFIG[PERK_TREE[remaining[i]].rarity].weight
        if (roll <= 0) {
        chosen.push(remaining[i])
        remaining.splice(i, 1)
        break
        }
    }
    }
    return chosen
}