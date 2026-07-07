import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 
    `postgres://${process.env.POSTGRES_USER ?? 'gameuser'}:${process.env.POSTGRES_PASSWORD ?? 'devpassword'}@localhost:5432/${process.env.POSTGRES_DB ?? 'excavaze'}`
})

export const db = drizzle(pool, { schema })
export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]