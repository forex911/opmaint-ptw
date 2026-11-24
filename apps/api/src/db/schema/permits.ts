import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { plants } from './plants.js';
import { areas } from './areas.js';
import { equipment } from './equipment.js';
import { ALL_PERMIT_STATUSES } from '@ptw/shared';

export const permits = pgTable(
  'permits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    permitNo: text('permit_no').notNull().unique(),
    type: text('type').notNull(),
    status: text('status').notNull(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    contractorTeam: text('contractor_team').notNull(),
    workDescription: text('work_description').notNull(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'restrict' }),
    areaId: uuid('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'restrict' }),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'restrict' }),
    plannedStart: timestamp('planned_start', { withTimezone: true, mode: 'date' }).notNull(),
    plannedEnd: timestamp('planned_end', { withTimezone: true, mode: 'date' }).notNull(),
    hazards: text('hazards')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    ppe: text('ppe')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    completionNotes: text('completion_notes'),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    verifiedBy: uuid('verified_by').references(() => users.id, { onDelete: 'set null' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    permitsWindowCheck: check(
      'permits_window_check',
      sql`${table.plannedEnd} > ${table.plannedStart}`
    ),
    permitsStatusCheck: check(
      'permits_status_check',
      sql`${table.status} IN (${sql.raw(
        ALL_PERMIT_STATUSES.map((s) => `'${s}'`).join(', ')
      )})`
    ),
    permitsStatusIdx: index('permits_status_idx').on(table.status),
    permitsPlannedEndIdx: index('permits_planned_end_idx').on(table.plannedEnd),
    permitsAreaIdIdx: index('permits_area_id_idx').on(table.areaId),
    permitsRequesterIdIdx: index('permits_requester_id_idx').on(table.requesterId),
  })
);

export type Permit = typeof permits.$inferSelect;
export type NewPermit = typeof permits.$inferInsert;
