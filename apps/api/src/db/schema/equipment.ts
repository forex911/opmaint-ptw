import { pgTable, uuid, text, boolean, index } from 'drizzle-orm/pg-core';
import { areas } from './areas.js';

export const equipment = pgTable(
  'equipment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    areaId: uuid('area_id')
      .notNull()
      .references(() => areas.id, { onDelete: 'restrict' }),
    tag: text('tag').notNull().unique(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => ({
    equipmentAreaIdIdx: index('equipment_area_id_idx').on(table.areaId),
  })
);

export type Equipment = typeof equipment.$inferSelect;
export type NewEquipment = typeof equipment.$inferInsert;
