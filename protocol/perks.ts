import { PLAYER_BASE_HP, PLAYER_BASE_RADIUS } from "./constants"
import { PlayerState } from "./types"

export interface PerkDef {
    title: string
    desc: string
    rarity: Rarity
    requiredPlayerLevel: number
    apply: (state: PlayerState) => void
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
        apply: (state) => { state.drillDmgMultiplier += 0.1 }
    },

    'drill_dmg_2': {
        title: 'Drill DMG++',
        desc: 'Drill damage +20%',
        rarity: 'rare',
        requiredPlayerLevel: 3,
        apply: (state) => { state.drillDmgMultiplier += 0.2 },
    },

    'drill_length': {
        title: 'Drill Length+',
        desc: 'Drill reach +15%',
        rarity: 'common',
        requiredPlayerLevel: 0,
        apply: (state) => { state.drillLengthMultiplier += 0.15 },
    },

    'drill_length_2': {
        title: 'Extended Bit',
        desc: 'Additional drill length +25%',
        rarity: 'rare',
        requiredPlayerLevel: 3,
        apply: (state) => { state.drillLengthMultiplier += 0.25 },
    },

    'move_speed': {
        title: 'Swift Soldier',
        desc: 'Movement speed +10%',
        rarity: 'common',
        requiredPlayerLevel: 0,
        apply: (state) => { state.moveSpeedMultiplier += 0.1 },
    },

    'move_speed_2': {
        title: 'Speedrunner',
        desc: "Additional +30% movement\n-20% max HP",
        rarity: 'rare',
        requiredPlayerLevel: 4,
        apply: (state) => { state.moveSpeedMultiplier += 0.30; state.maxHp -= 0.20 },
    },

    'hp_buff': {
        title: 'Tough Guy',
        desc: 'Max HP +20\nPlayer size +20%',
        rarity: 'common',
        requiredPlayerLevel: 1,
        apply: (state) => { state.maxHp += 20; state.playerRadius += PLAYER_BASE_RADIUS*0.20 },
    },

    'hp_buff_2': {
        title: 'Bastion',
        desc: 'Max HP +60\nPlayer size +40%',
        rarity: 'rare',
        requiredPlayerLevel: 8,
        apply: (state) => { state.maxHp += 60; state.playerRadius += PLAYER_BASE_RADIUS*0.40 },
    },

    'hp_regen': {
        title: 'Survivor',
        desc: 'Regenerate 1 HP per second',
        rarity: 'rare',
        requiredPlayerLevel: 4,
        apply: (state) => { state.hpRegenPerSec += 1 },
    },

    'hp_regen_2': {
        title: 'Nanobots',
        desc: 'Additional +2 hp regen/sec',
        rarity: 'epic',
        requiredPlayerLevel: 10,
        apply: (state) => { state.hpRegenPerSec += 2 },
    },

    'sawblade': {
        title: 'Sawblade',
        desc: 'Long range\nVery high damage',
        rarity: 'epic',
        requiredPlayerLevel: 10,
        apply: (state) => { state.drillType = 2 },
    },

    'deathblade': {
        title: 'Deathblade',
        desc: 'Giant saw blade\nLower drill DMG\nVery large damage area',
        rarity: 'legendary',
        requiredPlayerLevel: 20,
        apply: (state) => { state.drillType = 3 },
    },
}

export const PERK_TRANSITIONS: Record<string, string[]> = {
  'root':         ['drill_dmg', 'drill_length', 'move_speed', 'hp_buff'],
  'drill_dmg':    ['drill_dmg_2'],
  'drill_length': ['drill_length_2', 'sawblade'],
  'hp_buff':      ['hp_buff_2', 'hp_regen'],
  'hp_regen':     ['hp_regen_2'],
  'move_speed':   ['move_speed_2'],
  'sawblade':     ['deathblade']
}

export function activateCurrentPerks(playerState: PlayerState) {
    // TODO
}