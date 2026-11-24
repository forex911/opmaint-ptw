import { pgTable, uuid, text, boolean, index } from 'drizzle-orm/pg-core';
import { permits } from './permits.js';
import { users } from './users.js';

export const permitPrecautions = pgTable(
  'permit_precautions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => permits.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    checked: boolean('checked').notNull().default(false),
    checkedBy: uuid('checked_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    permitPrecautionsPermitIdIdx: index('permit_precautions_permit_id_idx').on(table.permitId),
  })
);

export type PermitPrecaution = typeof permitPrecautions.$inferSelect;
export type NewPermitPrecaution = typeof permitPrecautions.$inferInsert;
