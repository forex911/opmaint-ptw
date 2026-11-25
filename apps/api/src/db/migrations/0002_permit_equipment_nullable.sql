-- 0002_permit_equipment_nullable.sql
-- Allow equipment_id to be nullable for areas or permits without specific equipment

ALTER TABLE permits ALTER COLUMN equipment_id DROP NOT NULL;
