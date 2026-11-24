import { pgTable, uuid, text, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { permits } from './permits.js';
import { users } from './users.js';

export const permitApprovals = pgTable(
  'permit_approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => permits.id, { onDelete: 'cascade' }),
    requiredRole: text('required_role').notNull(),
    requiredUserId: uuid('required_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('PENDING'),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    comment: text('comment'),
    signatureData: text('signature_data'),
  },
  (table) => ({
    permitApprovalsStatusCheck: check(
      'permit_approvals_status_check',
      sql`${table.status} IN ('PENDING', 'APPROVED', 'REJECTED')`
    ),
    permitApprovalsPermitIdIdx: index('permit_approvals_permit_id_idx').on(table.permitId),
    permitApprovalsStatusIdx: index('permit_approvals_status_idx').on(table.status),
  })
);

export type PermitApproval = typeof permitApprovals.$inferSelect;
export type NewPermitApproval = typeof permitApprovals.$inferInsert;
