import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { QUEST_TEMPLATE_MAP, QUEST_TEMPLATES } from '../../protocol/data/quests'

export interface OfflineProfile {
  username: string
  gems: number
  permanentUpgrades: string[]
  guestToken: string | null
  questsGeneratedAt: number | null
}

type ProfileKey = keyof OfflineProfile
type ProfileValue = OfflineProfile[ProfileKey]

export interface OfflineQuestInstance {
  id: string
  questId: string
  status: 'active' | 'queued' | 'completed'
  progress: number
  createdAt: number
  completedAt: number | null
}

interface OfflineDB extends DBSchema {
  profile: {
    key: ProfileKey
    value: ProfileValue
  }
  quests: {
    key: string
    value: OfflineQuestInstance
  }
}

const DB_NAME = 'excavaze.io-offline-db'
const DB_VERSION = 2
const STORE_NAME = 'profile'
const QUEST_STORE = 'quests'

const OFFLINE_DEFAULTS: OfflineProfile = {
  username: '',
  gems: 0,
  permanentUpgrades: [],
  guestToken: null,
  questsGeneratedAt: null,
}

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null

function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME))
          db.createObjectStore(STORE_NAME)
        if (!db.objectStoreNames.contains(QUEST_STORE))
          db.createObjectStore(QUEST_STORE, { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

// --- Full profile ---
export async function loadOfflineProfile(): Promise<OfflineProfile> {
  const db = await getDB()
  const [username, gems, permanentUpgrades, guestToken, questsGeneratedAt] = await Promise.all([
    db.get(STORE_NAME, 'username'),
    db.get(STORE_NAME, 'gems'),
    db.get(STORE_NAME, 'permanentUpgrades'),
    db.get(STORE_NAME, 'guestToken'),
    db.get(STORE_NAME, 'questsGeneratedAt'),
  ])
  return {
    username: (username as string) ?? OFFLINE_DEFAULTS.username,
    gems: (gems as number) ?? OFFLINE_DEFAULTS.gems,
    permanentUpgrades: (permanentUpgrades as string[]) ?? [...OFFLINE_DEFAULTS.permanentUpgrades],
    guestToken: (guestToken as string) ?? null,
    questsGeneratedAt: (questsGeneratedAt as number) ?? null,
  }
}

// --- Username ---
export async function loadOfflineUsername(): Promise<string> {
  const db = await getDB()
  return ((await db.get(STORE_NAME, 'username')) as string) ?? OFFLINE_DEFAULTS.username
}

export async function saveOfflineUsername(username: string): Promise<void> {
  const db = await getDB()
  await db.put(STORE_NAME, username, 'username')
}

// --- Gems ---
export async function loadOfflineGems(): Promise<number> {
  const db = await getDB()
  return ((await db.get(STORE_NAME, 'gems')) as number) ?? OFFLINE_DEFAULTS.gems
}

export async function saveOfflineGems(gems: number): Promise<void> {
  const db = await getDB()
  await db.put(STORE_NAME, gems, 'gems')
}

// --- Permanent upgrades ---
export async function loadOfflineUpgrades(): Promise<string[]> {
  const db = await getDB()
  return ((await db.get(STORE_NAME, 'permanentUpgrades')) as string[]) ?? [...OFFLINE_DEFAULTS.permanentUpgrades]
}

export async function saveOfflineUpgrades(upgrades: string[]): Promise<void> {
  const db = await getDB()
  await db.put(STORE_NAME, upgrades, 'permanentUpgrades')
}

// --- Guest token ---
export async function loadGuestToken(): Promise<string | null> {
  const db = await getDB()
  return ((await db.get(STORE_NAME, 'guestToken')) as string) ?? null
}

export async function saveGuestToken(token: string): Promise<void> {
  const db = await getDB()
  await db.put(STORE_NAME, token, 'guestToken')
}

// --- Quests ---
const TARGET_LIVE_COUNT = 7
const TARGET_ACTIVE_COUNT = 3

function isNewUtcDay(lastMs: number | null): boolean {
  if (!lastMs) return true
  const last = new Date(lastMs)
  const now = new Date()
  return last.getUTCFullYear() !== now.getUTCFullYear()
    || last.getUTCMonth() !== now.getUTCMonth()
    || last.getUTCDate() !== now.getUTCDate()
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Only active/queued instances — mirrors server's getPlayerQuests
export async function getOfflineQuests(): Promise<OfflineQuestInstance[]> {
  const db = await getDB()
  const all = await db.getAll(QUEST_STORE)
  return all.filter(q => q.status === 'active' || q.status === 'queued')
}

export async function refreshOfflineQuestsIfNeeded(): Promise<void> {
  const db = await getDB()
  const questsGeneratedAt = ((await db.get(STORE_NAME, 'questsGeneratedAt')) as number | null) ?? null
  if (!isNewUtcDay(questsGeneratedAt)) return

  const live = await getOfflineQuests()
  const liveQuestIds = new Set(live.map(q => q.questId))
  const activeCount = live.filter(q => q.status === 'active').length
  const needed = TARGET_LIVE_COUNT - live.length

  if (needed > 0) {
    const allInstances = await db.getAll(QUEST_STORE)
    const history = allInstances.filter(q => q.status === 'completed')
    const lastCompletedAt = new Map(history.map(h => [h.questId, h.completedAt ?? 0]))
    const eligible = shuffle(QUEST_TEMPLATES.filter(t => !liveQuestIds.has(t.id)))
      .sort((a, b) => (lastCompletedAt.get(a.id) ?? 0) - (lastCompletedAt.get(b.id) ?? 0))
      .slice(0, needed)

    let remainingActiveSlots = TARGET_ACTIVE_COUNT - activeCount
    for (const template of eligible) {
      const status: OfflineQuestInstance['status'] = remainingActiveSlots > 0 ? 'active' : 'queued'
      if (remainingActiveSlots > 0) remainingActiveSlots--
      await db.put(QUEST_STORE, {
        id: crypto.randomUUID(), questId: template.id, status, progress: 0,
        createdAt: Date.now(), completedAt: null,
      })
    }
  }

  await db.put(STORE_NAME, Date.now(), 'questsGeneratedAt')
}

// cumulative quests: kill_square, kill_player — returns updates for the caller to broadcast
export async function tickOfflineQuestProgress(event: string, amount = 1): Promise<{ instanceId: string, progress: number, completed: boolean }[]> {
  const db = await getDB()
  const questIds = new Set(QUEST_TEMPLATES.filter(t => t.event === event).map(t => t.id))
  if (questIds.size === 0) return []

  const all = await db.getAll(QUEST_STORE)
  const updates: { instanceId: string, progress: number, completed: boolean }[] = []
  for (const q of all) {
    if (q.status !== 'active' || !questIds.has(q.questId)) continue
    const template = QUEST_TEMPLATE_MAP.get(q.questId)
    if (!template) continue
    const wasComplete = q.progress >= template.target
    q.progress += amount
    await db.put(QUEST_STORE, q)
    updates.push({ instanceId: q.id, progress: q.progress, completed: !wasComplete && q.progress >= template.target })
  }
  return updates
}

// single-run quests: survive_duration, reach_xp, reach_level — persisted only, no broadcast
// (GameHud already predicts these live via CLIENT_QUEST_GETTERS, same as online mode)
export async function setOfflineQuestProgress(instanceId: string, progress: number): Promise<void> {
  const db = await getDB()
  const q = await db.get(QUEST_STORE, instanceId)
  if (!q || q.status !== 'active') return
  q.progress = progress
  await db.put(QUEST_STORE, q)
}

export interface OfflineClaimResult {
  success: boolean
  rewardGems?: number
  promotedQuestId?: string
  promotedInstanceId?: string
}

export async function claimOfflineQuest(instanceId: string): Promise<OfflineClaimResult> {
  const db = await getDB()
  const row = await db.get(QUEST_STORE, instanceId)
  if (!row || row.status !== 'active') return { success: false }

  const template = QUEST_TEMPLATE_MAP.get(row.questId)
  if (!template || row.progress < template.target) return { success: false }

  const all = await db.getAll(QUEST_STORE)
  for (const other of all) {
    if (other.questId === row.questId && other.status === 'completed' && other.id !== row.id) {
      await db.delete(QUEST_STORE, other.id)
    }
  }

  row.status = 'completed'
  row.progress = template.target
  row.completedAt = Date.now()
  await db.put(QUEST_STORE, row)

  const nextQueued = all
    .filter(q => q.status === 'queued')
    .sort((a, b) => a.createdAt - b.createdAt)[0]
  if (nextQueued) {
    nextQueued.status = 'active'
    await db.put(QUEST_STORE, nextQueued)
  }

  return { success: true, rewardGems: template.rewardGems, promotedQuestId: nextQueued?.questId, promotedInstanceId: nextQueued?.id }
}