export interface UpgradeNode {
    id: string
    desc: string
    icon: string
    cost: { currency: 'gem' | 'green_core' | 'purple_core' | 'yellow_core', amount: number }[]
    parents: string[]
    x: number
    y: number
}

export const UPGRADE_NODES: UpgradeNode[] = [
    {
        id: 'drill_dmg_1',
        desc: '+1% drill damage.',
        icon: 'gem.svg',
        cost: [{ currency: 'gem', amount: 30 }],
        parents: [],
        x: 200,
        y: 300,
    },
    {
        id: 'drill_dmg_2',
        desc: '+2% drill damage.',
        icon: 'gem.svg',
        cost: [{ currency: 'gem', amount: 120 }],
        parents: ['drill_dmg_1'],
        x: 480,
        y: 320,
    },
    {
        id: 'drill_dmg_3',
        desc: '+3% drill damage.',
        icon: 'gem.svg',
        cost: [{ currency: 'gem', amount: 450 }],
        parents: ['drill_dmg_2'],
        x: 200,
        y: 700,
    },
    {
        id: 'drill_dmg_4',
        desc: '+4% drill damage.',
        icon: 'gem.svg',
        cost: [{ currency: 'gem', amount: 1080 }],
        parents: ['drill_dmg_3'],
        x: 200,
        y: 900,
    },
    {
        id: 'drill_dmg_5',
        desc: '+5% drill damage.',
        icon: 'gem.svg',
        cost: [{ currency: 'gem', amount: 1600 }],
        parents: ['drill_dmg_4'],
        x: 200,
        y: 1100,
    },
]