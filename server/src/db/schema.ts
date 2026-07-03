import { pgTable, uuid, varchar, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 32 }).notNull().unique(),
  gemBalance: integer('gem_balance').notNull().default(0),
  isGuest: boolean('is_guest').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});