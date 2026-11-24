-- 0001_permit_type_check.sql
-- Enforce permit type values via SQL CHECK constraint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'permits_type_check'
  ) THEN
    ALTER TABLE permits
      ADD CONSTRAINT permits_type_check CHECK (type IN ('HOT_WORK', 'CONFINED_SPACE', 'WORKING_AT_HEIGHT', 'ELECTRICAL_LOTO'));
  END IF;
END $$;
