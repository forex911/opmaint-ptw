import { pgTable, uuid, text } from 'drizzle-orm/pg-core';

export const plants = pgTable('plants', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  address: text('address'),
});

export type Plant = typeof plants.$inferSelect;
export type NewPlant = typeof plants.$inferInsert;
