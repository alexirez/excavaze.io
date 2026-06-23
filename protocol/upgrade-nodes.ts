export interface UpgradeNode {
    id: string
    desc: string
    icon: string
    cost: { currency: 'gem' | 'green_core' | 'purple_core' | 'yellow_core', amount: number }[]
    parents: string[]
    x: number
    y: number
}

export const UPGRADE_NODES: UpgradeNode[] = []