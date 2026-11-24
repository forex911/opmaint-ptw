import { pgTable, uuid, text, index } from 'drizzle-orm/pg-core';
import { plants } from './plants.js';
import { users } from './users.js';

export const areas = pgTable(
  'areas',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    plantId: uuid('plant_id')
      .notNull()
      .references(() => plants.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (table) => ({
    areasPlantIdIdx: index('areas_plant_id_idx').on(table.plantId),
    areasOwnerIdIdx: index('areas_owner_id_idx').on(table.ownerId),
  })
);

export type Area = typeof areas.$inferSelect;
export type NewArea = typeof areas.$inferInsert;
