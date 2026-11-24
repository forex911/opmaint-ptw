import { pgTable, uuid, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { permits } from './permits.js';
import { users } from './users.js';

export const permitWorkLogs = pgTable(
  'permit_work_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => permits.id, { onDelete: 'cascade' }),
    loggedBy: uuid('logged_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    note: text('note').notNull(),
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    permitWorkLogsKindCheck: check('permit_work_logs_kind_check', sql`${table.kind} IN ('NOTE', 'ENTRY', 'EXIT')`),
    permitWorkLogsPermitIdIdx: index('permit_work_logs_permit_id_idx').on(table.permitId),
  })
);

export type PermitWorkLog = typeof permitWorkLogs.$inferSelect;
export type NewPermitWorkLog = typeof permitWorkLogs.$inferInsert;
