import { pgTable, uuid, varchar, integer, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 32 }).notNull().unique(),
  guestToken: text('guest_token').unique(),
  gems: integer('gems').notNull().default(0),
  purchasedUpgrades: text('purchased_upgrades').array().notNull().default([]),
  isGuest: boolean('is_guest').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});