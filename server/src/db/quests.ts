import { eq, and, ne, inArray, asc, sql } from 'drizzle-orm'
import { db, type DbOrTx } from './client'
import { players, playerQuests } from './schema'
import { QUEST_TEMPLATES, QUEST_TEMPLATE_MAP, type QuestTemplate } from '../../../protocol/data/quests'
import { grantGems } from './transactions'

const TARGET_LIVE_COUNT = 7
const TARGET_ACTIVE_COUNT = 3

function isNewUtcDay(last: Date | null): boolean {
  if (!last) return true
  const now = new Date()
  return last.getUTCFullYear() !== now.getUTCFullYear()
    || last.getUTCMonth() !== now.getUTCMonth()
    || last.getUTCDate() !== now.getUTCDate()
}

export async function getPlayerQuests(playerId: string) {
  return db.select().from(playerQuests)
    .where(and(eq(playerQuests.playerId, playerId), inArray(playerQuests.status, ['active', 'queued'])))
}

export async function refreshQuestsIfNeeded(playerId: string) {
  const [player] = await db.select().from(players).where(eq(players.id, playerId))
  if (!player) return
  if (!isNewUtcDay(player.questsGeneratedAt)) return

  const live = await getPlayerQuests(playerId)
  const liveQuestIds = new Set(live.map(q => q.questId))
  const activeCount = live.filter(q => q.status === 'active').length
  const needed = TARGET_LIVE_COUNT - live.length

  if (needed > 0) {
    const history = await db.select().from(playerQuests)
      .where(and(eq(playerQuests.playerId, playerId), eq(playerQuests.status, 'completed')))

    const lastCompletedAt = new Map(history.map(h => [h.questId, h.completedAt]))
    const eligible = shuffle(QUEST_TEMPLATES.filter(t => !liveQuestIds.has(t.id)))
      .sort((a, b) => (lastCompletedAt.get(a.id)?.getTime() ?? 0) - (lastCompletedAt.get(b.id)?.getTime() ?? 0))
      .slice(0, needed)

    let remainingActiveSlots = TARGET_ACTIVE_COUNT - activeCount
    for (const template of eligible) {
      const status = remainingActiveSlots > 0 ? 'active' : 'queued'
      if (remainingActiveSlots > 0) remainingActiveSlots--
      await db.insert(playerQuests).values({ playerId, questId: template.id, status, progress: 0 })
    }
  }

  await db.update(players).set({ questsGeneratedAt: new Date() }).where(eq(players.id, playerId))
}

// cumulative quests: kill_square, kill_player
export async function tickQuestProgress(playerId: string, event: string, amount = 1) {
  const questIds = QUEST_TEMPLATES.filter(t => t.event === event).map(t => t.id)
  if (questIds.length === 0) return

  await db.update(playerQuests)
    .set({ progress: sql`${playerQuests.progress} + ${amount}` })
    .where(and(
      eq(playerQuests.playerId, playerId),
      eq(playerQuests.status, 'active'),
      inArray(playerQuests.questId, questIds),
    ))
}

// single-run quests: survive_duration, reach_xp, reach_level — progress set directly by instance, not matched by event
export async function setQuestProgress(playerId: string, instanceId: string, progress: number) {
  await db.update(playerQuests)
    .set({ progress })
    .where(and(
      eq(playerQuests.playerId, playerId),
      eq(playerQuests.id, instanceId),
      eq(playerQuests.status, 'active'),
    ))
}

async function finalizeQuestCompletion(tx: DbOrTx, playerId: string, row: typeof playerQuests.$inferSelect, template: QuestTemplate) {
  await tx.delete(playerQuests).where(and(
    eq(playerQuests.playerId, playerId),
    eq(playerQuests.questId, row.questId),
    eq(playerQuests.status, 'completed'),
    ne(playerQuests.id, row.id),
  ))

  await tx.update(playerQuests)
    .set({ status: 'completed', progress: template.target, completedAt: new Date() })
    .where(eq(playerQuests.id, row.id))

  const [nextQueued] = await tx.select().from(playerQuests)
    .where(and(eq(playerQuests.playerId, playerId), eq(playerQuests.status, 'queued')))
    .orderBy(asc(playerQuests.id))
    .limit(1)

  if (nextQueued) {
    await tx.update(playerQuests).set({ status: 'active' }).where(eq(playerQuests.id, nextQueued.id))
  }

  return nextQueued
}

export interface ClaimResult {
  success: boolean
  reason?: string
  gems?: number
  promotedQuestId?: string
  promotedInstanceId?: string
}

async function resolveQuestCompletion(playerId: string, instanceId: string, requireProgress: boolean): Promise<ClaimResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(playerQuests).where(eq(playerQuests.id, instanceId)).for('update')
    if (!row || row.playerId !== playerId) return { success: false, reason: 'not_found' }
    if (row.status !== 'active') return { success: false, reason: 'not_active' }

    const template = QUEST_TEMPLATE_MAP.get(row.questId)
    if (!template) return { success: false, reason: 'invalid_template' }
    if (requireProgress && row.progress < template.target) return { success: false, reason: 'incomplete' }

    const nextQueued = await finalizeQuestCompletion(tx, playerId, row, template)
    const gems = await grantGems(playerId, template.rewardGems, tx)
    return { success: true, gems, promotedQuestId: nextQueued?.questId, promotedInstanceId: nextQueued?.id }
  })
}

// player-initiated: client sends claim_quest, progress checked against target
export function claimQuest(playerId: string, instanceId: string): Promise<ClaimResult> {
  return resolveQuestCompletion(playerId, instanceId, true)
}

// server-initiated: caller already confirmed the threshold is met, no check needed
export function completeQuestInstantly(playerId: string, instanceId: string): Promise<ClaimResult> {
  return resolveQuestCompletion(playerId, instanceId, false)
}

// helper method to shuffle when assigning new quests to player
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}