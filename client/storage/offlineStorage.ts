import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface OfflineProfile {
  username: string
  diamonds: number
  permanentUpgrades: string[]
}

type ProfileKey = keyof OfflineProfile
type ProfileValue = OfflineProfile[ProfileKey]

interface OfflineDB extends DBSchema {
  profile: {
    key: ProfileKey
    value: ProfileValue
  }
}

const DB_NAME = 'excavaze.io-offline-db'
const DB_VERSION = 1
const STORE_NAME = 'profile'

const OFFLINE_DEFAULTS: OfflineProfile = {
  username: '',
  diamonds: 0,
  permanentUpgrades: [],
}

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null

function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME))
          db.createObjectStore(STORE_NAME)
      },
    })
  }
  return dbPromise
}

// --- Full profile ---
export async function loadOfflineProfile(): Promise<OfflineProfile> {
  const db = await getDB()
  const [username, diamonds, permanentUpgrades] = await Promise.all([
    db.get(STORE_NAME, 'username'),
    db.get(STORE_NAME, 'diamonds'),
    db.get(STORE_NAME, 'permanentUpgrades'),
  ])
  return {
    username: (username as string) ?? OFFLINE_DEFAULTS.username,
    diamonds: (diamonds as number) ?? OFFLINE_DEFAULTS.diamonds,
    permanentUpgrades: (permanentUpgrades as string[]) ?? [...OFFLINE_DEFAULTS.permanentUpgrades],
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

// --- Diamonds ---
export async function loadOfflineDiamonds(): Promise<number> {
  const db = await getDB()
  return ((await db.get(STORE_NAME, 'diamonds')) as number) ?? OFFLINE_DEFAULTS.diamonds
}

export async function saveOfflineDiamonds(diamonds: number): Promise<void> {
  const db = await getDB()
  await db.put(STORE_NAME, diamonds, 'diamonds')
}

// --- Permanent upgrades ---
export async function loadOfflinePermanentUpgrades(): Promise<string[]> {
  const db = await getDB()
  return ((await db.get(STORE_NAME, 'permanentUpgrades')) as string[]) ?? [...OFFLINE_DEFAULTS.permanentUpgrades]
}

export async function saveOfflinePermanentUpgrades(upgrades: string[]): Promise<void> {
  const db = await getDB()
  await db.put(STORE_NAME, upgrades, 'permanentUpgrades')
}