import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { players } from './schema'

export interface PlayerRecord {
  dbId: string
  guestToken: string
  gems: number
  purchasedUpgrades: string[]
}

function toRecord(row: typeof players.$inferSelect): PlayerRecord {
  return {
    dbId: row.id,
    guestToken: row.guestToken!,
    gems: row.gems,
    purchasedUpgrades: row.purchasedUpgrades,
  }
}

export async function createGuestPlayer(): Promise<PlayerRecord> {
  const guestToken = randomBytes(32).toString('hex')
  const username = `guest_${guestToken.slice(0, 10)}`

  const [row] = await db.insert(players).values({ username, guestToken, isGuest: true }).returning()
  return toRecord(row)
}

export async function getPlayerByToken(token: string): Promise<PlayerRecord | null> {
  const [row] = await db.select().from(players).where(eq(players.guestToken, token))
  return row ? toRecord(row) : null
}

export async function identifyPlayer(token: string | null): Promise<{ record: PlayerRecord, isNewGuest: boolean }> {
  if (token) {
    const existing = await getPlayerByToken(token)
    if (existing) return { record: existing, isNewGuest: false }
  }
  const created = await createGuestPlayer()
  return { record: created, isNewGuest: true }
}