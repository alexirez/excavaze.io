import { eq, sql } from 'drizzle-orm'
import { db, type DbOrTx } from './client'
import { players } from './schema'
import { UPGRADE_NODES } from '../../../protocol/data/upgrade-nodes'

export interface PurchaseResult {
  success: boolean
  reason?: string
  gems: number
  purchasedUpgrades: string[]
}

export async function grantGems(dbId: string, amount: number, executor: DbOrTx = db): Promise<number> {
  const [row] = await executor.update(players)
    .set({ gems: sql`${players.gems} + ${amount}` })
    .where(eq(players.id, dbId))
    .returning({ gems: players.gems })
  return row?.gems ?? 0
}

export async function deductGems(dbId: string, amount: number): Promise<number> {
  const [row] = await db.update(players)
    .set({ gems: sql`GREATEST(${players.gems} - ${amount}, 0)` })
    .where(eq(players.id, dbId))
    .returning({ gems: players.gems })
  return row?.gems ?? 0
}

export async function purchaseUpgrade(dbId: string, nodeId: string): Promise<PurchaseResult> {
  const node = UPGRADE_NODES.get(nodeId)
  if (!node) return { success: false, reason: 'invalid_node', gems: 0, purchasedUpgrades: [] }

  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(players).where(eq(players.id, dbId)).for('update')
    if (!row) return { success: false, reason: 'player_not_found', gems: 0, purchasedUpgrades: [] }

    if (row.purchasedUpgrades.includes(nodeId))
      return { success: false, reason: 'already_purchased', gems: row.gems, purchasedUpgrades: row.purchasedUpgrades }

    if (!node.parents.every(pid => row.purchasedUpgrades.includes(pid)))
      return { success: false, reason: 'missing_parent', gems: row.gems, purchasedUpgrades: row.purchasedUpgrades }

    const gemCost = node.cost.find(c => c.currency === 'gem')?.amount ?? 0
    if (row.gems < gemCost)
      return { success: false, reason: 'insufficient_gems', gems: row.gems, purchasedUpgrades: row.purchasedUpgrades }

    const newGems = row.gems - gemCost
    const newUpgrades = [...row.purchasedUpgrades, nodeId]

    await tx.update(players)
      .set({ gems: newGems, purchasedUpgrades: newUpgrades })
      .where(eq(players.id, dbId))

    return { success: true, gems: newGems, purchasedUpgrades: newUpgrades }
  })
}