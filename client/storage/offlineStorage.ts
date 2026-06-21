import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface PlayerProfile {
  username: string;
  diamonds: number;
  permanentUpgrades: string[];
}

type ProfileKey = keyof PlayerProfile;
type ProfileValue = PlayerProfile[ProfileKey];

interface OfflineDB extends DBSchema {
  profile: {
    key: ProfileKey;
    value: ProfileValue;
  };
}

const DB_NAME = 'excavaze.io-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'profile';

const DEFAULT_PROFILE: PlayerProfile = {
  username: '',
  diamonds: 0,
  permanentUpgrades: [],
};

let dbPromise: Promise<IDBPDatabase<OfflineDB>> | null = null

function getDB(): Promise<IDBPDatabase<OfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      },
    })
  }
  return dbPromise
}

export async function loadProfile(): Promise<PlayerProfile> {
  const db = await getDB();
  const [username, diamonds, permanentUpgrades] = await Promise.all([
    db.get(STORE_NAME, 'username'),
    db.get(STORE_NAME, 'diamonds'),
    db.get(STORE_NAME, 'permanentUpgrades'),
  ]);
  return {
    username: (username as string) ?? DEFAULT_PROFILE.username,
    diamonds: (diamonds as number) ?? DEFAULT_PROFILE.diamonds,
    permanentUpgrades:
        (permanentUpgrades as string[]) ?? [...DEFAULT_PROFILE.permanentUpgrades],
  };
}

export async function saveUsername(username: string): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, username, 'username');
}

export async function saveDiamonds(diamonds: number): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, diamonds, 'diamonds');
}

export async function savePermanentUpgrades(
  upgrades: string[]
): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, upgrades, 'permanentUpgrades');
}