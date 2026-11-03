import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const guildEvents = sqliteTable('guild_events', {
 id: text('id').primaryKey(),
 title: text('title').notNull(),
 startsAt: text('starts_at').notNull(),
 duration: integer('duration').notNull(),
 category: text('category').notNull(),
 description: text('description').notNull(),
 createdAt: text('created_at').notNull(),
});
export const wowheadCache = sqliteTable('wowhead_cache', {
 key: text('key').primaryKey(),
 payload: text('payload'),
 fetchedAt: integer('fetched_at'),
 checkedAt: integer('checked_at').notNull(),
 error: text('error'),
});
