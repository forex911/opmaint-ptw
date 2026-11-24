import { pgTable, uuid, text } from 'drizzle-orm/pg-core';

export const plants = pgTable('plants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
});

export type Plant = typeof plants.$inferSelect;
export type NewPlant = typeof plants.$inferInsert;
