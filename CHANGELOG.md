# Changelog

All notable changes to the CMMS Permit to Work (PTW) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.6.0] - 2026-11-24 - Stage 6: Background Expiry Sweeper & Internal Endpoints

### Added
- Background Expiry Sweeper (`apps/api/src/modules/permits/sweeper/expiry-sweeper.ts`):
  - `node-cron` scheduled job running every 60 seconds (`* * * * *`) by default.
  - In-process overlap prevention (`isSweeping` guard + active sweep promise tracking).
  - Injectable clock dependency (`clock: () => Date`) enabling deterministic unit and integration tests.
  - Pluggable scheduler abstraction for custom test scheduler injection.
  - Graceful server startup and shutdown in `server.ts` awaiting active sweep completion on `SIGTERM` and `SIGINT`.
- Distributed Row-Locking & Savepoint Transaction Engine:
  - `bulkExpireOverduePermits` in `expiry.service.ts`: begins outer transaction and locks candidate overdue permits using PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED`.
  - Holds row locks continuously on the database connection throughout all candidate transitions and audit writes until outer `COMMIT`.
  - Per-permit savepoints (`SAVEPOINT sp_<id>`): prevents partial state by ensuring any individual transition failure rolls back that specific candidate without aborting the batch or leaving a transitioned permit missing its audit entry.
  - Precise response semantics: `{ scanned: number, expiredCount: number, expiredPermitIds: string[] }` strictly guaranteeing `expiredCount === expiredPermitIds.length`.
- Internal Sweep Endpoint (`POST /internal/sweep`):
  - Protected by `X-Sweep-Secret` request header matching `SWEEP_SECRET` (minimum 32 characters).
  - Constant-time secret verification using `crypto.timingSafeEqual` preventing timing side-channel attacks.
  - Zero secret leakage: secrets are never logged to console/files or echoed in response bodies.
  - Sanitized, identical HTTP 401 `UNAUTHORIZED` responses for missing or mismatched secrets.
- Comprehensive Test Suite (`sweeper.test.ts`):
  - 13 real PostgreSQL tests covering valid internal sweep, 401s on invalid/missing secrets, automated clock injection, multi-instance concurrency, race conditions with permit extensions, repeated sweeps on already-expired permits, batch savepoint atomicity, invalid cron expression validation, idempotent `startSweeper()`, safe repeated `stopSweeper()`, secret leakage prevention, and simultaneous dashboard read concurrency.

---

## [0.5.0] - 2026-11-24 - Stage 5: Permit HTTP Endpoints, Server-Side Filtering, Concurrency & Work Logs

### Added
- Universal Read Visibility Model (`D-020`):
  - All authenticated roles (`REQUESTER`, `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN`) are permitted read visibility across reference data, permits, dashboard statistics, and audit timelines.
- Reference Data Endpoints:
  - `GET /api/plants`: lists all industrial plants.
  - `GET /api/areas`: lists areas with area owner metadata (supports `?plantId=<uuid>`).
  - `GET /api/equipment`: lists tagged machinery and equipment (supports `?areaId=<uuid>`).
- Location Consistency Validation:
  - `permit-validation.service.ts`: validates equipment is in area and area is in plant, rejecting inconsistencies with 422 `VALIDATION_ERROR`.
- Bulk Lazy Expiry:
  - `expiry.service.ts`: automatically scans and bulk-expires overdue permits (`PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED`) before queries execute, preventing expired permits from rendering as active.
- Permit CRUD & Lifecycle Endpoints:
  - `POST /api/permits`: allows `REQUESTER` and `ADMIN` to draft permits with sequential numbering (`ptw_permit_no_seq`) and initial audit logging.
  - `GET /api/permits`: server-side filtering (`status`, `type`, `areaId`, `from`, `to`, `mine`, `pendingMyApproval`), sorting, and pagination.
  - `GET /api/permits/stats`: aggregated counts breakdown by status, active permits, permits expiring in 2 hours, and dynamic `pendingMyApproval` re-using state machine guards.
  - `GET /api/permits/:id`: detailed view joining plants, areas, equipment, requester, approval tiers, work logs, and dynamically computed `allowedActions`.
  - `PATCH /api/permits/:id`: updates permit parameters in `DRAFT` or `PENDING_APPROVAL` with optimistic locking (`version`), mass-assignment protection rejecting forbidden fields (`status`, `requesterId`, `permitNo`), audit field diff logging, and approval reset back to `DRAFT` when editing in `PENDING_APPROVAL`.
  - `GET /api/permits/:id/audit`: ordered immutable audit timeline, labeling NULL actors as `"System"` per `D-018`.
  - `POST /api/permits/:id/work-logs`: logs `NOTE`, `ENTRY`, or `EXIT` logs on `ACTIVE` permits with attendant tracking.
  - State Machine Action Routes: mounted HTTP endpoints for all 9 permit transitions (`/submit`, `/approve`, `/reject`, `/activate`, `/suspend`, `/resume`, `/close`, `/verify`, `/cancel`).
- Comprehensive Integration Test Suite:
  - `permits.test.ts` (19 integration tests) covering reference endpoints, location validation, create, update, optimistic locking, bulk expiry, filter parameters, stats, audit timeline formatting, work logs, and complete end-to-end HTTP lifecycle.

---

## [0.4.0] - 2026-11-24 - Stage 4: State Machine, Concurrency Row-Locking & Lazy Expiry

### Added
- Central Permit State Machine transition engine in `apps/api/src/modules/permits/state-machine/`:
  - `transition-engine.ts`: Core atomic transition execution inside PostgreSQL transactions with `SELECT ... FOR UPDATE` row-level locking.
  - `transitions.ts`: Declarative `TRANSITION_TABLE` defining legal `(from, to, allowedRoles, guards)` transitions and dynamic `getAllowedActions()`.
  - `guards.ts`: 10 pure, unit-testable guards enforcing domain safety invariants.
  - `types.ts`: TypeScript contracts for actions, rules, context, and guard results.
- Persistent Lazy Expiry:
  - Automatically identifies overdue permits in `APPROVED`, `ACTIVE`, and `SUSPENDED` states when accessed.
  - Commits `status = 'EXPIRED'` to PostgreSQL and creates an immutable audit row with `actor_id = NULL` (D-018) even when the caller's action is rejected with 409.
- Multi-tier Approvals on Submit:
  - Creates Area Owner approval tier snapshotting the area's current owner user ID (`required_user_id`) at submit time (D-014).
  - Creates Safety Officer approval tier.
  - Enforces conditional transition: permit remains in `PENDING_APPROVAL` with intermediate audit logs until all tiers are complete.
  - Rejection of any tier marks the row and transitions permit directly to `REJECTED`.
- Separation of Duties (Four-Eyes Principle / D-019):
  - Server-side guard preventing any single person (`actor.id`) from satisfying multiple approval tiers on the same permit.
- Safety & Environmental Guards:
  - Early activation block: prevents activation before `planned_start`.
  - Atmospheric gas re-verification freshness (D-010): blocks activation of `CONFINED_SPACE` permits if gas test reading is older than 60 minutes.
  - Mandatory completion notes on closure.
  - Mandatory reason on rejection, suspension, and cancellation.
  - Self-action guards: prevents permit requesters from approving, rejecting, or verifying their own permits.
- Integration & Concurrency Test Suites:
  - `transition.test.ts` (101 tests): Full 100-cell transition matrix, dynamic allowed-actions calculation, multi-tier approvals, separation of duties, and lazy expiry persistence.
  - `concurrency.test.ts` (4 tests): Concurrent simultaneous approvals serialized via row locking without lost updates (version increments cleanly from 2 to 4), concurrent approve vs reject race condition handling, concurrent double activation, and concurrent activate vs cancel.
- Decisions:
  - `D-018`: System audit actor attribution with nullable `actor_id` for automated lazy expiry and background sweeper jobs.
  - `D-019`: Separation of duties (Four-Eyes Principle) on permit approvals.

---

## [0.3.0] - 2026-11-24 - Stage 3: Authentication, Role Middleware, Security Headers & Error Handling

### Added
- Cookie-only JWT authentication:
  - `POST /api/auth/login`: Rate-limited endpoint validating credentials, comparing against constant-time dummy hash on unknown email, and setting `httpOnly`, `SameSite=Lax` cookie.
  - `POST /api/auth/logout`: Clears the session cookie.
  - `GET /api/auth/me`: Guarded endpoint returning authenticated user identity (never returning password hash).
- Stateless JWT utilities in `apps/api/src/utils/jwt.ts`: tokens carry only `userId` in payload.
- Authentication & Authorization middleware:
  - `requireAuth`: Reads cookie (no Bearer fallback per D-016), decodes token, loads fresh user and active role from database.
  - `requireRole(...roles)`: Enforces role authorization barriers, returning HTTP 403 on role mismatch.
- Centralized error handling & validation:
  - Custom `AppError` class with HTTP status, machine-readable code, and details.
  - Centralized `errorHandler` enforcing `{ error: { code, message, details? } }` with production stack trace suppression.
  - Zod request validation middleware returning HTTP 422 `VALIDATION_ERROR` with path-indexed field errors.
  - 404 route handler returning `{ error: { code: 'NOT_FOUND', message } }`.
- Operational & Security hardening:
  - Custom `helmetMiddleware` providing OWASP security response headers.
  - In-memory sliding window `rateLimiter` (5 attempts / 15 min per IP) on login.
  - `GET /health` endpoint returning 200 `{ status: 'ok', timestamp }`.
  - Express `trust proxy` enabled for reverse proxy environments.
  - Required 32-character `JWT_SECRET` with no default value.
- Decisions `D-015` (Pre-release migration baseline) and `D-016` (Cookie-only auth and reverse-proxy deployment).
- Integration test suite in `apps/api/src/modules/auth/auth.test.ts` with 16 comprehensive test cases.

---

## [0.2.1] - 2026-11-24 - Stage 2b: Database Hardening, Test Isolation, and Constraint Verification

### Added
- Sequence advancement via `setval` in `apps/api/src/db/seed.ts` to ensure permits created via `getNextPermitNumber()` generate strictly unique numbers past seeded permits.
- Database migration `0001_permit_type_check.sql` adding `permits_type_check` SQL constraint.
- Unit test in `apps/api/src/db/schema.test.ts` verifying that SQL CHECK constraints on `users` (`users_role_check`), `permits` (`permits_status_check`), and `permits` (`permits_type_check`) match `@ptw/shared` enums.
- Dedicated `ptw_cmms_test` database configuration via `TEST_DATABASE_URL` in `apps/api/vitest.config.ts`, `.env.example`, and test runner.
- Statement-level `BEFORE TRUNCATE` trigger on `audit_log` prohibiting table truncation.
- Dedicated application role `ptw_app_user` with explicit `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log`.
- `ON DELETE RESTRICT` constraint on `audit_log.permit_id` preventing deletion of permits that have audit logs.
- Decision `D-014` documenting Area Owner approval user snapshot at submit time.

### Changed
- Updated `D-012` to state an honest threat model (database superuser administrative capabilities).
- Standardized compliance wording across documentation to reference "factory safety regulators and auditors".
- Aligned PostgreSQL 16 and port 5432 configuration across `docker-compose.yml`, `README.md`, and `.env.example`.
- Confirmed Docker Compose PostgreSQL 16 container runs healthy on local host.

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
