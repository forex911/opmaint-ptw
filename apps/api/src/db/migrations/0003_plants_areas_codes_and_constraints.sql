-- 0003_plants_areas_codes_and_constraints.sql
-- Add natural unique code and address to plants, code to areas, and unique constraint on (plant_id, code)

-- 1. Plants: code and address
ALTER TABLE plants ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE plants ADD COLUMN IF NOT EXISTS address TEXT;

-- Enforce unique constraint on plants.code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plants_code_unique'
  ) THEN
    ALTER TABLE plants ADD CONSTRAINT plants_code_unique UNIQUE (code);
  END IF;
END $$;

-- 2. Areas: code and unique constraint on (plant_id, code)
ALTER TABLE areas ADD COLUMN IF NOT EXISTS code TEXT;

-- Enforce unique constraint on areas(plant_id, code)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'areas_plant_id_code_unique'
  ) THEN
    ALTER TABLE areas ADD CONSTRAINT areas_plant_id_code_unique UNIQUE (plant_id, code);
  END IF;
END $$;
