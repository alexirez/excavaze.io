import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface OfflineProfile {
  username: string
  gems: number
  permanentUpgrades: string[]
  guestToken: string | null
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
  gems: 0,
  permanentUpgrades: [],
  guestToken: null,
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
  const [username, gems, permanentUpgrades, guestToken] = await Promise.all([
    db.get(STORE_NAME, 'username'),
    db.get(STORE_NAME, 'gems'),
    db.get(STORE_NAME, 'permanentUpgrades'),
    db.get(STORE_NAME, 'guestToken'),
  ])
  return {
    username: (username as string) ?? OFFLINE_DEFAULTS.username,
    gems: (gems as number) ?? OFFLINE_DEFAULTS.gems,
    permanentUpgrades: (permanentUpgrades as string[]) ?? [...OFFLINE_DEFAULTS.permanentUpgrades],
    guestToken: (guestToken as string) ?? null,
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