import { pgTable, bigserial, uuid, text, timestamp, jsonb, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';

export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').notNull(),
    fromValue: jsonb('from_value'),
    toValue: jsonb('to_value'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    adminAuditEntityTypeCheck: check(
      'admin_audit_log_entity_type_check',
      sql`${table.entityType} IN ('USER', 'PLANT', 'AREA', 'EQUIPMENT')`
    ),
    adminAuditActorIdIdx: index('admin_audit_log_actor_id_idx').on(table.actorId),
    adminAuditEntityIdx: index('admin_audit_log_entity_idx').on(table.entityType, table.entityId),
    adminAuditCreatedAtIdx: index('admin_audit_log_created_at_idx').on(table.createdAt),
  })
);

export type AdminAuditLogEntry = typeof adminAuditLog.$inferSelect;
export type NewAdminAuditLogEntry = typeof adminAuditLog.$inferInsert;
