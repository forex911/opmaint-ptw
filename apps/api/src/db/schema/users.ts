import { pgTable, uuid, text, boolean, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ALL_USER_ROLES } from '@ptw/shared';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => ({
    usersRoleCheck: check(
      'users_role_check',
      sql`${table.role} IN (${sql.raw(
        ALL_USER_ROLES.map((r) => `'${r}'`).join(', ')
      )})`
    ),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
