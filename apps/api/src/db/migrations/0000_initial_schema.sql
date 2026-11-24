-- 0000_initial_schema.sql
-- CMMS Permit to Work (PTW) Initial Schema Migration

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sequence for human-readable atomic permit numbering (e.g. PTW-2026-0001)
CREATE SEQUENCE IF NOT EXISTS ptw_permit_no_seq START WITH 1 INCREMENT BY 1;

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  CONSTRAINT users_role_check CHECK (role IN ('REQUESTER', 'AREA_OWNER', 'SAFETY_OFFICER', 'ADMIN'))
);

-- 2. Plants table
CREATE TABLE IF NOT EXISTS plants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

-- 3. Areas table (each area has one owner)
CREATE TABLE IF NOT EXISTS areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES plants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS areas_plant_id_idx ON areas (plant_id);
CREATE INDEX IF NOT EXISTS areas_owner_id_idx ON areas (owner_id);

-- 4. Equipment table
CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
  tag TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS equipment_area_id_idx ON equipment (area_id);

-- 5. Core Permits table
CREATE TABLE IF NOT EXISTS permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_no TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contractor_team TEXT NOT NULL,
  work_description TEXT NOT NULL,
  plant_id UUID NOT NULL REFERENCES plants(id) ON DELETE RESTRICT,
  area_id UUID NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  planned_start TIMESTAMPTZ NOT NULL,
  planned_end TIMESTAMPTZ NOT NULL,
  hazards TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ppe TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completion_notes TEXT,
  closed_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  CONSTRAINT permits_window_check CHECK (planned_end > planned_start),
  CONSTRAINT permits_status_check CHECK (status IN (
    'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUSPENDED',
    'REJECTED', 'EXPIRED', 'CLOSED', 'CLOSED_VERIFIED', 'CANCELLED'
  ))
);
CREATE INDEX IF NOT EXISTS permits_status_idx ON permits (status);
CREATE INDEX IF NOT EXISTS permits_planned_end_idx ON permits (planned_end);
CREATE INDEX IF NOT EXISTS permits_area_id_idx ON permits (area_id);
CREATE INDEX IF NOT EXISTS permits_requester_id_idx ON permits (requester_id);

-- 6. Permit Precautions checklist
CREATE TABLE IF NOT EXISTS permit_precautions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id UUID NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  checked BOOLEAN NOT NULL DEFAULT false,
  checked_by UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS permit_precautions_permit_id_idx ON permit_precautions (permit_id);

-- 7. Permit Approvals table
CREATE TABLE IF NOT EXISTS permit_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id UUID NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
  required_role TEXT NOT NULL,
  required_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  comment TEXT,
  signature_data TEXT,
  CONSTRAINT permit_approvals_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);
CREATE INDEX IF NOT EXISTS permit_approvals_permit_id_idx ON permit_approvals (permit_id);
CREATE INDEX IF NOT EXISTS permit_approvals_status_idx ON permit_approvals (status);

-- 8. Permit Work Logs table (ACTIVE only, kind: NOTE|ENTRY|EXIT)
CREATE TABLE IF NOT EXISTS permit_work_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id UUID NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
  logged_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT permit_work_logs_kind_check CHECK (kind IN ('NOTE', 'ENTRY', 'EXIT'))
);
CREATE INDEX IF NOT EXISTS permit_work_logs_permit_id_idx ON permit_work_logs (permit_id);

-- 9. Permit Extensions table
CREATE TABLE IF NOT EXISTS permit_extensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id UUID NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  extra_hours INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  CONSTRAINT permit_extensions_hours_check CHECK (extra_hours > 0 AND extra_hours <= 4),
  CONSTRAINT permit_extensions_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);
CREATE INDEX IF NOT EXISTS permit_extensions_permit_id_idx ON permit_extensions (permit_id);

-- 10. Audit Log table (Append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  permit_id UUID REFERENCES permits(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  from_value JSONB,
  to_value JSONB,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS audit_log_permit_id_idx ON audit_log (permit_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx ON audit_log (actor_id);

-- Append-only trigger: forbids UPDATE and DELETE on audit_log
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: UPDATE and DELETE operations are strictly prohibited';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log;
CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
