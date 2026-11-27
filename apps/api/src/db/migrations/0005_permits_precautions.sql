-- 0005_permits_precautions.sql
-- Persists editable safety precautions checklist array directly on permits
-- while backfilling any existing permit_precautions records.

ALTER TABLE permits
  ADD COLUMN IF NOT EXISTS precautions TEXT[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE permits p
SET precautions = COALESCE(
  (
    SELECT ARRAY_AGG(pp.text ORDER BY pp.text)
    FROM permit_precautions pp
    WHERE pp.permit_id = p.id
  ),
  ARRAY[]::text[]
)
WHERE cardinality(p.precautions) = 0;
