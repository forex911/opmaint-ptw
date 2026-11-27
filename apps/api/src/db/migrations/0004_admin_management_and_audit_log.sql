-- 0004_admin_management_and_audit_log.sql
-- Add is_active soft-deactivation flags and append-only admin_audit_log table

-- 1. Soft-deactivation flags (never hard-delete reference or identity rows)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE plants ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS users_is_active_idx ON users (is_active);
CREATE INDEX IF NOT EXISTS plants_is_active_idx ON plants (is_active);
CREATE INDEX IF NOT EXISTS areas_is_active_idx ON areas (is_active);
CREATE INDEX IF NOT EXISTS equipment_is_active_idx ON equipment (is_active);

-- 2. Dedicated append-only Admin Audit Log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  from_value JSONB,
  to_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT admin_audit_log_entity_type_check CHECK (
    entity_type IN ('USER', 'PLANT', 'AREA', 'EQUIPMENT')
  )
);

CREATE INDEX IF NOT EXISTS admin_audit_log_actor_id_idx ON admin_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_entity_idx ON admin_audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON admin_audit_log (created_at DESC);

-- 3. Append-only row-level trigger: forbids UPDATE and DELETE on admin_audit_log
CREATE OR REPLACE FUNCTION admin_audit_log_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only: UPDATE and DELETE operations are strictly prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_audit_log_immutable ON admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_immutable
BEFORE UPDATE OR DELETE ON admin_audit_log
FOR EACH ROW EXECUTE FUNCTION admin_audit_log_immutable();

-- 4. Append-only statement-level trigger: forbids TRUNCATE on admin_audit_log
CREATE OR REPLACE FUNCTION admin_audit_log_truncate_prohibited() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only: TRUNCATE is strictly prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_audit_log_truncate ON admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_truncate
BEFORE TRUNCATE ON admin_audit_log
FOR EACH STATEMENT EXECUTE FUNCTION admin_audit_log_truncate_prohibited();

-- 5. Preserve least-privilege permissions for ptw_app_user
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ptw_app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ptw_app_user;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ptw_app_user;
    REVOKE UPDATE, DELETE, TRUNCATE ON admin_audit_log FROM ptw_app_user;
  END IF;
END
$$;
