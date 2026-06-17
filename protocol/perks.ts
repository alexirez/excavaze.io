import { PlayerState } from "./types"

export interface PerkDef {
    title: string
    desc: string
    rarity: Rarity
    requiredPlayerLevel: number
    apply: (state: PlayerState, level: number) => void
}

const RARITY_CONFIG = {
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
        apply: (state, level) => { state.drillDmgMultiplier += 0.1 }
    }
}

export const PERK_TRANSITIONS: Record<string, string[]> = {
  'root':         ['drill_dmg', 'drill_length', 'move_speed', 'hp_buff'],
  'drill_dmg':    ['drill_dmg_2'],
  'drill_length': ['drill_length_2', 'sawblade'],
  'hp_buff':      ['hp_buff_2', 'hp_regen'],
  'hp_regen':     ['hp_regen_2'],
}