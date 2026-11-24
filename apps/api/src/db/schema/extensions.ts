import { pgTable, uuid, text, integer, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { permits } from './permits.js';
import { users } from './users.js';

export const permitExtensions = pgTable(
  'permit_extensions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => permits.id, { onDelete: 'cascade' }),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    extraHours: integer('extra_hours').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('PENDING'),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    permitExtensionsStatusCheck: check(
      'permit_extensions_status_check',
      sql`${table.status} IN ('PENDING', 'APPROVED', 'REJECTED')`
    ),
    permitExtensionsHoursCheck: check('permit_extensions_hours_check', sql`${table.extraHours} > 0 AND ${table.extraHours} <= 4`),
    permitExtensionsPermitIdIdx: index('permit_extensions_permit_id_idx').on(table.permitId),
  })
);

export type PermitExtension = typeof permitExtensions.$inferSelect;
export type NewPermitExtension = typeof permitExtensions.$inferInsert;
