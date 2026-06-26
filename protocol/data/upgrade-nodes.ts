import { PLAYER_BASE_HP } from "../constants"
import { PlayerState } from "../types"

export interface UpgradeNode {
    desc: string
    cost: { currency: 'gem' | 'green_core' | 'purple_core' | 'yellow_core', amount: number }[]
    parents: string[]
    x: number
    y: number
}

export const UPGRADE_NODES: Map<string, UpgradeNode> = new Map([
    ['drill_dmg_1', {
        desc: '+1% drill damage',
        cost: [{ currency: 'gem', amount: 30 }],
        parents: [],
        x: 200, y: 300,
        apply: (state: PlayerState) => { state.drillDmgMultiplier += 0.01 }
    }],
    ['drill_dmg_2', {
        desc: '+2% drill damage',
        cost: [{ currency: 'gem', amount: 120 }],
        parents: ['drill_dmg_1'],
        x: 340, y: 340,
        apply: (state: PlayerState) => { state.drillDmgMultiplier += 0.01 }
    }],
    ['drill_dmg_3', {
        desc: '+3% drill damage',
        cost: [{ currency: 'gem', amount: 450 }],
        parents: ['drill_dmg_2'],
        x: 480, y: 380,
        apply: (state: PlayerState) => { state.drillDmgMultiplier += 0.01 }
    }],
    ['drill_dmg_4', {
        desc: '+4% drill damage',
        cost: [{ currency: 'gem', amount: 1080 }],
        parents: ['drill_dmg_3'],
        x: 620, y: 420,
        apply: (state: PlayerState) => { state.drillDmgMultiplier += 0.01 }
    }],
    ['drill_dmg_5', {
        desc: '+5% drill damage',
        cost: [{ currency: 'gem', amount: 1600 }],
        parents: ['drill_dmg_4'],
        x: 760, y: 460,
        apply: (state: PlayerState) => { state.drillDmgMultiplier += 0.01 }
    }],
    ['HP_1', {
        desc: '+1% HP',
        cost: [{ currency: 'gem', amount: 30 }],
        parents: [],
        x: 1000, y: 300,
        apply: (state: PlayerState) => { state.maxHp += PLAYER_BASE_HP * 0.01 }
    }],
    ['HP_2', {
        desc: '+2% HP',
        cost: [{ currency: 'gem', amount: 120 }],
        parents: ['HP_1'],
        x: 1140, y: 340,
        apply: (state: PlayerState) => { state.maxHp += PLAYER_BASE_HP * 0.01 }
    }],
    ['HP_3', {
        desc: '+3% HP',
        cost: [{ currency: 'gem', amount: 450 }],
        parents: ['HP_2'],
        x: 1280, y: 380,
        apply: (state: PlayerState) => { state.maxHp += PLAYER_BASE_HP * 0.01 }
    }],
    ['HP_4', {
        desc: '+4% HP',
        cost: [{ currency: 'gem', amount: 1080 }],
        parents: ['HP_3'],
        x: 1420, y: 420,
        apply: (state: PlayerState) => { state.maxHp += PLAYER_BASE_HP * 0.01 }
    }],
    ['HP_5', {
        desc: '+5% HP',
        cost: [{ currency: 'gem', amount: 1600 }],
        parents: ['HP_4'],
        x: 1560, y: 460,
        apply: (state: PlayerState) => { state.maxHp += PLAYER_BASE_HP * 0.01 }
    }],
    ['drill_length_1', {
        desc: '+1% drill length',
        cost: [{ currency: 'gem', amount: 30 }],
        parents: [],
        x: 200, y: 600,
        apply: (state: PlayerState) => { state.drillLengthMultiplier += 0.01 }
    }],
    ['drill_length_2', {
        desc: '+2% drill length',
        cost: [{ currency: 'gem', amount: 120 }],
        parents: ['drill_length_1'],
        x: 340, y: 640,
        apply: (state: PlayerState) => { state.drillLengthMultiplier += 0.01 }
    }],
    ['drill_length_3', {
        desc: '+3% drill length',
        cost: [{ currency: 'gem', amount: 450 }],
        parents: ['drill_length_2'],
        x: 480, y: 680,
        apply: (state: PlayerState) => { state.drillLengthMultiplier += 0.01 }
    }],
    ['drill_length_4', {
        desc: '+4% drill length',
        cost: [{ currency: 'gem', amount: 1080 }],
        parents: ['drill_length_3'],
        x: 620, y: 720,
        apply: (state: PlayerState) => { state.drillLengthMultiplier += 0.01 }
    }],
    ['drill_length_5', {
        desc: '+5% drill length',
        cost: [{ currency: 'gem', amount: 1600 }],
        parents: ['drill_length_4'],
        x: 760, y: 760,
        apply: (state: PlayerState) => { state.drillLengthMultiplier += 0.01 }
    }],
    ['movement_1', {
        desc: '+1% movement',
        cost: [{ currency: 'gem', amount: 30 }],
        parents: [],
        x: 1000, y: 600,
        apply: (state: PlayerState) => { state.moveSpeedMultiplier += 0.01 }
    }],
    ['movement_2', {
        desc: '+2% movement',
        cost: [{ currency: 'gem', amount: 120 }],
        parents: ['movement_1'],
        x: 1140, y: 640,
        apply: (state: PlayerState) => { state.moveSpeedMultiplier += 0.01 }
    }],
    ['movement_3', {
        desc: '+3% movement',
        cost: [{ currency: 'gem', amount: 450 }],
        parents: ['movement_2'],
        x: 1280, y: 680,
        apply: (state: PlayerState) => { state.moveSpeedMultiplier += 0.01 }
    }],
    ['movement_4', {
        desc: '+4% movement',
        cost: [{ currency: 'gem', amount: 1080 }],
        parents: ['movement_3'],
        x: 1420, y: 720,
        apply: (state: PlayerState) => { state.moveSpeedMultiplier += 0.01 }
    }],
    ['movement_5', {
        desc: '+5% movement',
        cost: [{ currency: 'gem', amount: 1600 }],
        parents: ['movement_4'],
        x: 1560, y: 760,
        apply: (state: PlayerState) => { state.moveSpeedMultiplier += 0.01 }
    }],
])