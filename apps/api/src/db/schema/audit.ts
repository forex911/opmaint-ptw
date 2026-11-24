import { pgTable, bigserial, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { permits } from './permits.js';
import { users } from './users.js';

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    permitId: uuid('permit_id').references(() => permits.id, { onDelete: 'restrict' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    fromValue: jsonb('from_value'),
    toValue: jsonb('to_value'),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    auditLogPermitIdIdx: index('audit_log_permit_id_idx').on(table.permitId),
    auditLogCreatedAtIdx: index('audit_log_created_at_idx').on(table.createdAt),
    auditLogActorIdIdx: index('audit_log_actor_id_idx').on(table.actorId),
  })
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
