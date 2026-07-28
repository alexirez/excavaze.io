import { pgTable, uuid, varchar, integer, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const players = pgTable('players', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 32 }).notNull().unique(),
  guestToken: text('guest_token').unique(),
  gems: integer('gems').notNull().default(0),
  purchasedUpgrades: text('purchased_upgrades').array().notNull().default([]),
  isGuest: boolean('is_guest').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
  questsGeneratedAt: timestamp('quests_generated_at', { withTimezone: true }),
});

export const playerQuests = pgTable('player_quests', {
  id: uuid('id').primaryKey().defaultRandom(),
  playerId: uuid('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  questId: text('quest_id').notNull(),
  status: varchar('status', { length: 16 }).notNull(), // 'active' | 'queued' | 'completed'
  progress: integer('progress').notNull().default(0),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('player_quests_player_id_idx').on(table.playerId),
]);