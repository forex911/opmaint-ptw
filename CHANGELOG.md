# Changelog

All notable changes to the CMMS Permit to Work (PTW) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-11-24 - Stage 2: Database Schema, Migrations, Audit Trigger, and Idempotent Seed Script

### Added
- Complete PostgreSQL database schema via Drizzle ORM (`apps/api/src/db/schema/`):
  - `users`: UUID primary key, name, unique email, password hash, role check constraint.
  - `plants`: UUID primary key, name.
  - `areas`: plant foreign key, name, owner foreign key referencing `users`.
  - `equipment`: area foreign key, unique tag, name.
  - `permits`: human-readable `permit_no` (`PTW-YYYY-NNNN`), type, status, requester, location keys, window timestamps with `planned_end > planned_start` check constraint, JSONB `details`, version counter, and closure/verification metadata.
  - `permit_precautions`: checklist items with checked booleans and verifier foreign keys.
  - `permit_approvals`: multi-tier approval rows with `required_role`, nullable `required_user_id`, `PENDING|APPROVED|REJECTED` status check, and signature data.
  - `permit_work_logs`: active work logs (`NOTE|ENTRY|EXIT`) with author and timestamp.
  - `permit_extensions`: extension requests with 1-4 hour constraints and approver tracking.
  - `audit_log`: append-only audit events table with bigserial primary key, actor, action, JSONB before/after values, and comment.
- Database migration `0000_initial_schema.sql` implementing all tables, sequence `ptw_permit_no_seq`, foreign key constraints, indexes on status, planned_end, area_id, and permit_id, and PostgreSQL trigger `trg_audit_log_immutable`.
- Migration runner `apps/api/src/db/migrate.ts` tracking applied migrations.
- Database client `apps/api/src/db/client.ts` with connection pooling and atomic permit number generation.
- Idempotent seed script `apps/api/src/db/seed.ts` creating 4 role users, 2 Chennai plants, 3 areas, 6 equipment, and 11 permits covering all 10 statuses with valid registry details, approvals, and audit trail.
- Integration tests in `apps/api/src/db/schema.test.ts` verifying migrations, sequence formatting, window CHECK constraint, status enum constraint, audit trigger UPDATE/DELETE rejection, and seed script idempotency.
- Docker Compose configuration `docker-compose.yml` for local PostgreSQL 16.
- Architecture Decision Records `D-011` (Permit sequence), `D-012` (Audit trigger immutability), and `D-013` (Approvals model).

---

## [0.1.0] - 2026-11-24 - Stage 1 & 1b: Skeleton, Shared Package, and Dynamic Registry

### Added
- Monorepo workspace skeleton (`packages/shared`, `apps/api`, `apps/web` stub) with Node 20+ ESM and strict TypeScript.
- Core domain enums and types in `@ptw/shared` (`UserRole`, `PermitStatus`, `ApprovalStatus`, `WorkLogKind`, `ExtensionStatus`).
- Declarative permit type registry for `HOT_WORK`, `CONFINED_SPACE`, `WORKING_AT_HEIGHT`, `ELECTRICAL_LOTO`.
- Dynamic Zod schema compiler supporting `draft` and `submit` validation modes with domain timing rules.
- Express API configuration (`apps/api/src/config/env.ts`) with Zod-validated environment variables.
- Project documentation in `docs/` (`PROGRESS.md`, `DECISIONS.md`, `AI_USAGE.md`, `KNOWN_ISSUES.md`, `ARCHITECTURE.md`, `API.md`).
- Git hooks and CI workflow (`.github/workflows/ci.yml`).
