# CMMS Permit to Work (PTW) Module - Progress Log

This append-only log tracks every stage, unit of work, verification result, and decision.

---

## [2026-11-24 12:00] stage-01 / Repository skeleton, shared package, dynamic registry & environment configuration
- **Goal**: Initialize the monorepo architecture, implement shared enums/statuses/roles, build the dynamic permit type registry with dual schema generation (draft vs submit), configure API environment parsing with Zod, and establish architectural documentation.
- **Done**:
  - Initialized git repository, root workspaces (`packages/*`, `apps/*`), and `.gitignore`.
  - Built `@ptw/shared` package with roles (`REQUESTER`, `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN`), statuses (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED`, `REJECTED`, `EXPIRED`, `CLOSED`, `CLOSED_VERIFIED`, `CANCELLED`), work log kinds, and approval statuses.
  - Implemented permit type registry supporting `HOT_WORK`, `CONFINED_SPACE`, `WORKING_AT_HEIGHT`, `ELECTRICAL_LOTO`.
  - Built dynamic Zod schema generator supporting permissive `draft` mode, strict `submit` mode, and custom domain rules (e.g., 60-minute pre-entry gas test window for Confined Space).
  - Configured `@ptw/api` environment parsing (`apps/api/src/config/env.ts`) using Zod.
  - Documented architectural decision records in `docs/DECISIONS.md` (`D-001` through `D-009`).
  - Added unit test suite for dynamic schema generator and verified zero-code-change extensibility by dynamically registering a 5th type (`EXCAVATION`).
- **Commits**:
  - `494df1b` chore: initialize monorepo skeleton and workspaces
  - `cb183ba` feat(shared): implement shared enums, roles, and dynamic permit type registry
  - `50cb39f` test(shared): add tests for dynamic registry validation and draft/submit schemas
  - `b370642` feat(api): configure environment validation and api setup
  - `b359511` docs: add architectural decision records for stage 1
  - `174155a` chore(repo): add git hooks, typecheck/lint scripts, and CI workflow
  - `c9e9af3` merge: stage 01 skeleton, shared package, and type registry (tag: stage-01)
- **Verification**:
  - `npm run --workspace=@ptw/shared build` -> tsc compiled clean
  - `npm run --workspace=@ptw/shared test` -> 6/6 tests passed
  - `npm run --workspace=@ptw/api build` -> tsc compiled clean
  - `npm run --workspace=@ptw/api test` -> 1/1 tests passed
  - Clean clone test from temporary folder: `npm ci`, `npm run build`, `npm run test` passed 100%.
- **Decisions**:
  - D-001 through D-009.
- **Next**: stage-01b cleanup follow-ups, then Stage 2.

---

## [2026-11-24 12:25] stage-01b / Stage 1 Follow-ups and Cleanup
- **Goal**: Address review feedback: remove root duplicate AI_USAGE, add D-010 (Confined space atmosphere re-verification at activation), document git hook sandbox behavior, document remote push commands, and refine web scope wording.
- **Done**:
  - Removed duplicate root `AI_USAGE.md` (preserved `AI_AGENT.md` in root and `docs/AI_USAGE.md`).
  - Added `D-010` in `docs/DECISIONS.md` covering atmospheric gas re-verification at permit activation.
  - Documented git hook behavior under Windows execution sandbox and explicit pre-commit verification steps.
  - Documented remote push commands (`git push origin main --tags`, etc.).
  - Clarified `/apps/web` scope boundary in `README.md` and `docs/KNOWN_ISSUES.md`.
- **Commits**:
  - `6d7898d` docs: address stage 1 review feedback and add D-010
  - `7fb9fdd` docs: complete stage 01b updates including D-010 and rulebook tracking
  - `1f35355` merge: stage 01b cleanup and D-010 (tag: stage-01b)
- **Verification**:
  - `npm run typecheck` -> clean across all workspaces.
  - `npm run lint` -> clean across all workspaces.
  - `npm test` -> 7/7 tests passed.
- **Decisions**:
  - D-010 (Atmosphere test freshness at activation).
- **Next**: Start Stage 2 on `stage/02-schema`.

---

## [2026-11-24 12:45] stage-02 / Database Schema, Migrations, Audit Trigger & Seed Script
- **Goal**: Implement Drizzle ORM schema for all core tables, write migrations with check constraints and append-only audit trigger, create idempotent seed script (11 permits covering all 10 statuses, 4 roles), provide docker-compose configuration, and write tests on a real test database.
- **Done**:
  - Created Drizzle schema definitions for all 10 core tables in `apps/api/src/db/schema/` (`users`, `plants`, `areas`, `equipment`, `permits`, `precautions`, `approvals`, `work-logs`, `extensions`, `audit`).
  - Implemented initial migration `apps/api/src/db/migrations/0000_initial_schema.sql` including CHECK constraints, `ptw_permit_no_seq` sequence, and PostgreSQL trigger `trg_audit_log_immutable`.
  - Built database client and connection pool (`apps/api/src/db/client.ts`) with atomic permit number generator.
  - Created migration runner `apps/api/src/db/migrate.ts` with `_migrations` tracking table.
  - Created idempotent seed script `apps/api/src/db/seed.ts` seeding 4 users (hashed passwords), 2 Chennai plants, 3 areas, 6 equipment, 11 permits covering all 10 statuses (with valid registry details, approvals, and matching audit events).
  - Provided `docker-compose.yml` for local PostgreSQL 16 service.
  - Implemented real PostgreSQL test suite `apps/api/src/db/schema.test.ts` verifying migrations, sequence generation, CHECK constraints, audit trigger immutability, and seed script idempotency.
- **Commits**:
  - Staged on `stage/02-schema`.
- **Verification**:
  - `npm run typecheck` -> 0 errors across all workspaces.
  - `npm run lint` -> clean across all workspaces.
  - `npm run --workspace=@ptw/api db:migrate` -> Applied `0000_initial_schema.sql` cleanly.
  - `npm run --workspace=@ptw/api db:seed` -> Seeded 4 users, 2 plants, 3 areas, 6 equipment, 11 permits.
  - `npm run --workspace=@ptw/shared test` -> 6/6 tests passed.
  - `npm run --workspace=@ptw/api test` -> 7/7 tests passed (env validation + 6 real DB tests).
  - Total: 13/13 tests passing against real PostgreSQL database.
- **Decisions**:
  - D-011 (Permit sequence numbering format).
  - D-012 (Append-only audit trigger immutability).
  - D-013 (Permit approvals model).
- **Next**: Stage 02b review fixes, then Stage 3.

---

## [2026-11-24 13:40] stage-02b / Stage 2 Review Fixes & Schema Hardening
- **Goal**: Deliver 8 targeted fixes on `stage/02b-fixes`:
  1. Advance `ptw_permit_no_seq` past seeded numbers via `setval` and verify collision-free uniqueness.
  2. Harden `audit_log` with statement-level `BEFORE TRUNCATE` trigger, `ON DELETE RESTRICT` on `audit_log.permit_id`, create dedicated `ptw_app_user` application DB role with revoked privileges, add truncate test, and state honest threat model in `D-012`.
  3. Isolate tests using dedicated `ptw_cmms_test` database via `TEST_DATABASE_URL` and `apps/api/vitest.config.ts`.
  4. Prove local Docker Compose PostgreSQL 16 container healthy on port 5432, align versions/ports across `.env.example` and `README.md`, and confirm `.env` is gitignored.
  5. Add test verifying SQL CHECK value lists strictly match shared enums (`users_role_check`, `permits_status_check`, `permits_type_check`) with migration `0001_permit_type_check.sql`.
  6. Clarify and document that `migrate.ts` tracks applied migrations in `_migrations` table.
  7. Document Decision `D-014` on area-owner approval user snapshot vs dynamic resolution.
  8. Standardize regulator inspection wording to "factory safety regulators and auditors".
- **Commits**:
  - `28f9a1f` fix(db): advance permit sequence past seeded numbers and verify uniqueness
  - `540a8d8` fix(db): harden audit_log with truncate trigger, restrict fk, app role privileges, and honest threat model in D-012
  - `a6b373a` feat(db): isolate test database using ptw_cmms_test via TEST_DATABASE_URL
  - `5544528 chore(docker): verify docker compose postgres 16 healthy, align versions and verify env gitignored
  - `e5e1ee9` test(db): verify SQL check constraints match shared package enums
  - `8e6fc79` docs(db): clarify migration tracking table in migrate.ts
  - `f4684ef` docs: record decision D-014 on area-owner approval user assignment
  - `b1b94eb` docs: update regulatory inspection terminology in documentation to factory safety regulators and auditors
- **Verification**:
  - `npm run typecheck` -> 0 errors across all workspaces.
  - `npm run lint` -> clean across all workspaces.
  - `npm test` -> 17/17 tests passing across shared and api packages on dedicated `ptw_cmms_test` database.
  - `docker compose ps` -> `ptw_postgres` healthy on port 5432.
  - `git ls-files | Select-String "env"` -> confirms `.env` is gitignored.
- **Decisions**:
  - D-012 updated (Honest threat model for audit log).
  - D-014 (Area Owner approval snapshot at submit time).
- **Next**: Stage 02b review fixes, then Stage 3.

---

## [2026-11-24 15:00] stage-03 / Authentication, Role Middleware, Security Headers & Centralized Error Handling
- **Goal**: Implement cookie-only JWT authentication, constant-time login with timing-attack defense, role authorization middleware, OWASP security headers, login rate limiting, 422 validation middleware, 404 routing, health check, and rigorous integration test suite on real test database.
- **Done**:
  - Recorded Decision `D-015` on pre-release migration baseline and strict append-only policy going forward.
  - Recorded Decision `D-016` on cookie-only auth (`SameSite=Lax`, httpOnly) and same-origin reverse-proxy deployment architecture (with Vercel rewrite and cross-origin fallback).
  - Documented limitation in `docs/KNOWN_ISSUES.md` regarding stateless JWT logout and lack of server-side revocation list.
  - Updated `env.ts` requiring strict 32-character `JWT_SECRET` with no default value.
  - Configured database role separation: API connects as restricted `ptw_app_user`, migrations and seed scripts connect via `ADMIN_DATABASE_URL` (database owner).
  - Built custom `AppError` class and centralized `errorHandler` enforcing unified `{ error: { code, message, details? } }` envelope with production stack trace suppression.
  - Implemented request validation middleware returning HTTP 422 `VALIDATION_ERROR` with structured field paths.
  - Implemented custom `helmetMiddleware` providing OWASP security response headers (`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`, `Referrer-Policy: no-referrer`, and removal of `X-Powered-By`).
  - Implemented in-memory sliding window `rateLimiter` (5 attempts / 15 min per IP) on `/api/auth/login`.
  - Built cookie-only JWT utility (`signToken`, `verifyToken`) carrying ONLY `userId` in the payload; `requireAuth` loads user identity and active role from the database on every request.
  - Built `authService.login()` with constant-time bcrypt verification against pre-computed `DUMMY_HASH` when email is not found, returning identical 401 error envelopes for bad password and unknown email.
  - Built `GET /health` returning 200 `{ status: 'ok', timestamp }`, enabled `trust proxy`, and added 404 route handler returning `{ error: { code: 'NOT_FOUND', ... } }`.
  - Built comprehensive integration test suite `apps/api/src/modules/auth/auth.test.ts` (16 test cases) verifying all 4 roles, password rejection, unknown email response parity, forged and expired tokens, role authorization (403 on unauthorized, 200 on authorized), `/me` password exclusion, 422 validation errors, 404 routes, logout cookie clearing, and health check.
- **Commits**:
  - `3c0f5d0` docs: record decision D-015 on pre-release migrations and D-016 on cookie-only cross-origin architecture
  - `f435a8d` feat(config): enforce strict 32-char JWT_SECRET with no default and support admin DB url
  - `ca7af1e` feat(middleware): add custom AppError, 422 validation middleware, helmet security headers, and login rate limiter
  - `0a106ee` feat(auth): implement cookie-only JWT auth, constant-time login with dummy hash, and role middleware
  - `b6f49b0` feat(api): build express app with health endpoint, trust proxy, and auth routes
  - `eed4c2e` test(auth): add comprehensive integration tests for authentication, roles, error envelopes, and 422 validation
- **Verification**:
  - `npm run typecheck` -> 0 errors across all workspaces.
  - `npm run lint` -> clean across all workspaces.
  - `npm test` -> 27/27 tests passing across shared package, schema tests, and auth integration tests against `ptw_cmms_test`.
- **Decisions**:
  - D-015 (Pre-release migration baseline and strict append-only policy).
  - D-016 (Cookie-only auth and cross-origin reverse-proxy deployment).
- **Next**: Stage 03b follow-ups, then Stage 4.

---

## [2026-11-24 15:20] stage-03b / Stage 3 Review Follow-ups & Hardening
- **Goal**: Address review follow-ups:
  1. Record Decision `D-017` and `docs/KNOWN_ISSUES.md` entry for in-tree zero-dependency security middleware.
  2. Rate limit login keyed by (IP + email), max 10 failed attempts per 15 min, successes not counted, preventing reviewer lockout when switching accounts. Add test.
  3. Remove hardcoded password from migration, allow `APP_DB_PASSWORD` in env, handle environments where `CREATE ROLE` is not allowed, document for production in `README.md`.
  4. Confirm `0001_permit_type_check.sql` is guarded (`IF NOT EXISTS`) for clean runs on both fresh and migrated databases.
  5. Pin HS256 algorithm on `jwt.verify` to block 'none' and algorithm confusion attacks, and add unit test.
- **Done**:
  - Recorded Decision `D-017` and updated `docs/KNOWN_ISSUES.md`.
  - Refactored `loginRateLimiter` to track strictly failed attempts (HTTP 401) keyed by `${clientIp}:${email}` and reset failures on HTTP 200. Added test verifying lockout on 10 failures while preserving immediate access for other accounts.
  - Updated `0000_initial_schema.sql` to catch `insufficient_privilege` during role creation and removed hardcoded passwords. Updated `migrate.ts` to optionally configure password via `APP_DB_PASSWORD`. Added production role documentation in `README.md`.
  - Confirmed `0001_permit_type_check.sql` idempotency.
  - Updated `verifyToken` with `algorithms: ['HS256']` and added unit test asserting rejection of forged unpinned algorithm tokens.
- **Commits**:
  - `6b54d0f` docs: record decision D-017 and known issues entry for in-tree security middleware
  - `f359191` feat(auth): key login rate limiter by IP and email with failure-only tracking
  - `55a2762` fix(auth): remove hardcoded password from migration, pin HS256 algorithm on JWT verification, and test algorithm pinning
- **Verification**:
  - `npm run typecheck` -> 0 errors across all workspaces.
  - `npm run lint` -> clean across all workspaces.
  - `npm test` -> 29/29 tests passing across shared package, schema tests, and auth integration tests against `ptw_cmms_test`.
- **Decisions**:
  - D-017 (In-Tree Zero-Dependency Security Headers & Rate Limiting).
- **Next**: Merge into main, tag `stage-03b`, and proceed to Stage 4 on `stage/04-state-machine`.

---

## [2026-11-24 18:30] stage-04 / Permit State Machine, Concurrency Row-Locking & Lazy Expiry
- **Goal**: Implement the industrial-grade central state machine transition engine for permits. Ensure server-side enforcement, transactional `SELECT ... FOR UPDATE` row locking, declarative transition tables, pure unit-testable guards, persistent lazy expiry, multi-tier approvals creation with Area Owner snapshotting (D-014), conditional approval transitions, separation of duties (D-019), and automated audit actor attribution (D-018).
- **Done**:
  - Defined types and contracts in `apps/api/src/modules/permits/state-machine/types.ts`: `PermitAction`, `TransitionRule`, `GuardResult`, `TransitionContext`, `Permit`, `PermitApproval`.
  - Implemented 10 pure, unit-testable guards in `guards.ts` returning `{ ok: boolean, code?: string, message?: string }`:
    - `guardNoSelfAction`: Prevents requesters from approving, rejecting, or verifying their own permits.
    - `guardRequesterOwnership`: Restricts actions like submit, cancel, and close to the permit creator (or Admin).
    - `guardAreaOwnerAssignment`: Ensures Area Owners can only act on pending approval tiers for their assigned area.
    - `guardPendingApprovalRowExists`: Validates presence of pending approval tiers before allowing approve/reject.
    - `guardSeparationOfDuties` (D-019 / Four-Eyes Principle): Prevents any single individual (`actor.id`) from satisfying multiple approval tiers on the same permit.
    - `guardMandatoryComment`: Enforces non-empty comments on `reject`, `suspend`, and `cancel`.
    - `guardMandatoryCompletionNotes`: Enforces non-empty completion notes when closing an active permit.
    - `guardWindowDates`: Validates that `planned_end > planned_start`.
    - `guardSubmitDetails`: Validates permit details against the shared type registry submit schema.
    - `guardActivation`: Enforces that `now >= planned_start`, all approval tiers are `APPROVED`, and for `CONFINED_SPACE` permits, verifies that the atmospheric gas test reading is within 60 minutes of activation (D-010).
    - `guardNotExpired`: Validates `now < planned_end`.
  - Implemented declarative `TRANSITION_TABLE` in `transitions.ts` covering all valid state changes across the 10 domain statuses.
  - Implemented dynamic `getAllowedActions(permit, actor, approvals, now)` returning the exact real-time affordances for any given user and permit state.
  - Implemented atomic `transition()` engine in `transition-engine.ts`:
    - Single database transaction with `SELECT ... FOR UPDATE` row locking to serialize concurrent requests.
    - Persistent Lazy Expiry: When an expirable permit (`APPROVED`, `ACTIVE`, `SUSPENDED`) is accessed after `planned_end`, it commits `status = 'EXPIRED'` with an automated audit log row (`actor_id = NULL` per D-018) before evaluating the requested action (returning 409 `ILLEGAL_TRANSITION` if the action is not allowed).
    - Multi-tier approvals creation on `submit`: creates Area Owner tier (snapshotting `required_user_id` per D-014) and Safety Officer tier.
    - Conditional approval logic: permit remains `PENDING_APPROVAL` with an audit record after intermediate approvals; transitions to `APPROVED` only when all tiers are complete.
    - Direct terminal transition to `REJECTED` when any tier is rejected.
    - Automatic version counter increment and immutable audit log insertion in the same transaction.
  - Implemented exhaustive unit & integration test suite in `transition.test.ts` (101 tests):
    - Full 100-cell `(Status x Action)` matrix test verifying that all illegal transitions are rejected with HTTP 409 `ILLEGAL_TRANSITION` containing `allowedActions`.
    - Dynamic `getAllowedActions()` calculation for all roles.
    - Multi-tier approvals with Area Owner snapshotting (D-014).
    - Separation of duties (D-019) blocking duplicate signatures by the same actor.
    - Mandatory comments on reject, cancel, and suspend.
    - Activation window barrier: early activation rejected before `planned_start`.
    - Confined Space atmospheric gas test freshness: activation blocked if test > 60 minutes old (D-010).
    - Persistent lazy expiry: verifies `EXPIRED` status is permanently committed in PostgreSQL even when the caller's action is rejected.
    - Completion notes enforcement on close, verification by independent safety officer, and suspend/resume cycles.
  - Implemented concurrency integration test suite in `concurrency.test.ts` (4 tests):
    - Two simultaneous approvals on the same permit (`Promise.all([approve1, approve2])`): verified row locking serializes execution, both approval tiers transition to `APPROVED`, permit reaches `APPROVED`, and `version` increments from 2 to 4 without lost updates or race conditions.
    - Concurrent approve (last tier) vs reject (`Promise.allSettled([approve, reject])`): verified exactly one succeeds and the other fails with 409.
    - Concurrent double activate (`Promise.allSettled([activate1, activate2])`): verified exactly one succeeds, the other receives 409 `ILLEGAL_TRANSITION`.
    - Concurrent activate vs cancel: verified exactly one succeeds, the other fails with 409.
- **Commits**:
  - `640e601` docs: record decision D-018 on system audit actor and D-019 on separation of duties
  - `21f4746` feat(permits): implement declarative transition table, pure guards, and getAllowedActions
  - `552c877` feat(permits): implement atomic transition engine with row locking and persistent lazy expiry
  - `ce873d2` test(permits): add unit and matrix tests for state machine transitions, guards, and getAllowedActions
  - `5d2bace` test(permits): add concurrency tests for row-locked simultaneous approvals, activations, and cancels
- **Verification**:
  - `npm run typecheck` -> 0 errors across all workspaces.
  - `npm run lint` -> clean across all workspaces.
  - `npm test` -> 140/140 tests passing (6 shared + 134 api) against real PostgreSQL database `ptw_cmms_test`.
- **Decisions**:
  - D-018 (Automated System Audit Actor with Nullable `actor_id`).
  - D-019 (Separation of Duties / Four-Eyes Principle for Permit Approvals).
- **Next**: Merge into main, tag `stage-04`, and proceed to Stage 4b review follow-ups.

---

## [2026-11-24 18:45] stage-04b / Stage 4 Review Follow-ups & Hardening
- **Goal**: Complete 4 review follow-ups:
  1. Add hand-written expected transition matrix copied from specification state diagram (independent of `TRANSITION_TABLE`) and test table against it.
  2. Include `PENDING_APPROVAL` in lazy expiry (not `DRAFT`), update `D-018` and tests.
  3. Verify test proving rejected action 409 commits `EXPIRED` to DB, system audit row exists with `actor_id = NULL`, confirm `audit_log.actor_id` nullable in migration, and explain `"System"` labeling in audit timeline.
  4. Install `helmet` and `express-rate-limit` from npm registry, wire them into middleware, update `KNOWN_ISSUES.md`.
- **Done**:
  - Authored independent specification state diagram matrix in `transition.test.ts` testing all 10 statuses x 10 actions against `TRANSITION_TABLE` and proving zero outgoing transitions from terminal states (`CLOSED_VERIFIED`, `CANCELLED`, `REJECTED`, `EXPIRED`).
  - Added `PermitStatus.PENDING_APPROVAL` to `expirableStatuses` in `transition-engine.ts` and `transitions.ts`, updated `D-018`, added tests asserting `PENDING_APPROVAL` lazy expiry on overdue permits with 409 rejection and permanent PostgreSQL commit, and confirmed `DRAFT` is never lazily expired.
  - Verified `0000_initial_schema.sql` line 139 defines `actor_id UUID REFERENCES users(id) ON DELETE SET NULL` (nullable). Documented timeline formatting where `actor_id === null` maps to `"System"`.
  - Installed `helmet@^8.3.0` and `express-rate-limit@^8.7.5` in `apps/api/package.json`. Configured `helmetMiddleware` and `loginRateLimiter` with IPv6 safety via `ipKeyGenerator`.
- **Commits**:
  - `271a90b` test(permits): add hand-written spec transition matrix test and include PENDING_APPROVAL in lazy expiry per D-018
  - `629f91d` feat(security): install helmet and express-rate-limit packages and update middleware
- **Verification**:
  - `npm run typecheck` -> 0 errors across all workspaces.
  - `npm run lint` -> clean across all workspaces.
  - `npm test` -> 143/143 tests passing (6 shared + 137 api) against real PostgreSQL database `ptw_cmms_test`.
- **Decisions**:
  - D-018 updated (Expirable status coverage includes `PENDING_APPROVAL`, excludes `DRAFT`).
- **Next**: Merge into main, tag `stage-04b`, and proceed to Stage 5 on `stage/05-permit-endpoints`.

---

## [2026-11-24 19:35] stage-05 / Permit HTTP Endpoints, Filters, Concurrency & Work Logs
- **Goal**: Implement HTTP routes and controller actions for Permit CRUD, state transitions, reference data, audit timelines, server-side filtering, optimistic concurrency locking, and active work logs.
- **Done**:
  - Decision `D-020` (Universal Read Visibility Model): recorded and implemented universal read visibility for all authenticated roles on reference data, permits list/details, statistics, and audit timelines, eliminating spatial safety blindspots while strictly guarding state-mutating actions.
  - Reference Data Routes: `GET /api/plants`, `GET /api/areas` (filtered by `plantId`), `GET /api/equipment` (filtered by `areaId`) joined with assigned owners.
  - Location Hierarchy Validation (`permit-validation.service.ts`): server-side verification that equipment belongs to the area and area belongs to the plant, returning HTTP 422 with structured field errors on mismatch.
  - Bulk Lazy Expiry (`expiry.service.ts`): scans and commits lazy expiry on overdue permits (`PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED`) before queries execute, guaranteeing dashboards never display overdue permits as active.
  - Permit Creation (`POST /api/permits`): restricted to `REQUESTER` and `ADMIN`, verifies location hierarchy, validates draft-mode details schema, generates sequential permit numbers (`PTW-YYYY-NNNN`), and records initial `'create'` audit row.
  - Optimistic Concurrency & Mass-Assignment Guarded Update (`PATCH /api/permits/:id`): enforces strict Zod whitelist rejecting disallowed fields (`status`, `requesterId`, `permitNo`), requires integer `version` returning HTTP 409 `VERSION_CONFLICT` on mismatch, records field diffs in `audit_log`, and safely resets approvals back to `DRAFT` if edited while `PENDING_APPROVAL`.
  - Permit Querying & Statistics:
    - `GET /api/permits`: server-side filtering (`status`, `type`, `areaId`, `from`, `to`, `mine`, `pendingMyApproval`), sorting, and pagination with metadata.
    - `GET /api/permits/stats`: returns status breakdown, active counts, permits expiring within 2 hours, and dynamic `pendingMyApproval` counts reusing state machine guards.
  - Audit Event Timeline (`GET /api/permits/:id/audit`): returns chronologically ordered immutable audit records, automatically labeling `actor_id = NULL` events as `"System"` per `D-018`.
  - Confined Space & Active Work Logs (`POST /api/permits/:id/work-logs`): records `NOTE`, `ENTRY`, and `EXIT` logs on `ACTIVE` permits with attendant accountability, rejecting logs on non-active permits with 409 `ILLEGAL_TRANSITION`.
  - State Machine HTTP Integration: mounted transition endpoints (`/submit`, `/approve`, `/reject`, `/activate`, `/suspend`, `/resume`, `/close`, `/verify`, `/cancel`) delegating to the transactional state machine engine.
  - Comprehensive Integration Test Suite (`permits.test.ts`): 19 integration tests verifying reference endpoints, location validation, create, update, optimistic locking, bulk expiry, filter parameters, stats, audit timeline formatting, work logs, and complete end-to-end HTTP lifecycle.
- **Commits**:
  - `e1d9537` feat(permits): record D-020 read visibility, add reference data endpoints and guard status mapping
  - `84c3d57` feat(permits): implement bulk lazy expiry and plant/area/equipment hierarchy validation
  - `65771a6` feat(permits): implement permit CRUD, filters, pagination, stats, audit timeline, and work-logs
  - `af4ed3a` fix(permits): fix text array serialization, schema exports, and type annotations across permit modules
  - `ef1a968` test(permits): add comprehensive integration tests for CRUD, filters, stats, versioning, and work-logs
- **Verification**:
  - `npm run typecheck` -> 0 errors across all workspaces.
  - `npm run lint` -> clean across all workspaces.
  - `npm test` -> 162/162 tests passing (6 shared + 156 api) against real PostgreSQL database `ptw_cmms_test`.
- **Decisions**:
  - D-020 (Universal Read Visibility Model for Plant Safety).
- **Next**: Deliver Stage 5b review fixes and Stage 5c spec-compliance HTTP test suite, then proceed to Stage 6 (node-cron sweeper and POST /internal/sweep).

---

## [2026-11-24 20:00] stage-05b & stage-05c / Review Fixes, Guard Status Alignment & Spec-Compliance HTTP Suite
- **Goal**: Deliver all Stage 5b review fixes and implement Stage 5c HTTP specification compliance test suite using supertest against seeded demo users.
- **Done**:
  - Fix 1 (PATCH in PENDING_APPROVAL per D-021): Retains `status = 'PENDING_APPROVAL'` (no transition back to `DRAFT`). Resets existing `permit_approvals` rows to `PENDING` (`decided_by = NULL`, `decided_at = NULL`, `comment = NULL`). Inserts individual field diff audit records plus one `approvals_reset` audit record documenting previously signed-off tiers.
  - Fix 2 (Concurrency-Safe Bulk Expiry): Implemented row locking with `SELECT id FROM permits WHERE ... FOR UPDATE SKIP LOCKED` inside `bulkExpireOverduePermits`, preventing concurrent worker races while preserving serialization. Tested with 6 concurrent GET requests yielding exactly one `expire` audit row.
  - Fix 3 (SQL-Level `pendingMyApproval` Filter & Pagination): Pushed role/user matching and duties separation subqueries directly into SQL `whereClauses`, guaranteeing accurate `total`, `totalPages`, and collision-free pagination across multiple pages.
  - Fix 4 (Stage Numbering Alignment): Aligned project roadmap so Background Sweeper is Stage 6 and Permit Extensions are Stage 7 across all documentation.
  - Fix 5 (Guard Status Code Mapping to 422 per D-005): Mapped `MISSING_COMMENT` and `MISSING_COMPLETION_NOTES` to HTTP 422 in `GUARD_STATUS_MAP` and updated corresponding API and transition tests.
  - Stage 5c (HTTP Spec-Compliance Suite, `spec-compliance.test.ts`): Built 9 exhaustive end-to-end HTTP tests using `supertest` with all 4 seeded credentials:
    1. Direct API illegal transitions return 409 with `allowedActions` (draft -> activate, pending -> close, approved -> suspend, plus terminal states returning empty `allowedActions: []`).
    2. Self-approval blocked with 403 `FORBIDDEN_SELF_APPROVAL` even for admin users.
    3. Area owner cannot approve permit in unassigned area (403 `FORBIDDEN_AREA_MISMATCH`).
    4. Activation barriers: early activation before `planned_start` returns 409 `EARLY_ACTIVATION`, activation while `PENDING_APPROVAL` returns 409 `ILLEGAL_TRANSITION`.
    5. Expired permits are terminal: cannot reactivate, resume, or close.
    6. Work logs on non-active permits return 409 `ILLEGAL_TRANSITION`.
    7. Input validation barriers: reject without comment returns 422 `MISSING_COMMENT`, suspend without reason returns 422 `MISSING_COMMENT`, close without notes returns 422 `MISSING_COMPLETION_NOTES`.
    8. Immutable audit records written for all lifecycle actions: `create`, `update`, `submit`, `approve` (both tiers), `activate`, `close`, `verify`.
    9. Dynamic `allowedActions` strictly matches runtime execution: all listed actions succeed (200), unlisted actions fail (409/403).
- **Commits**:
  - `f90a1a5` fix(permits): retain PENDING_APPROVAL status and approval rows on PATCH, resetting approvals and recording diffs per D-021
  - `3e26e2a` fix(permits): make bulk expiry concurrency-safe using FOR UPDATE SKIP LOCKED and verify exactly one audit row
  - `0be4660` fix(permits): push pendingMyApproval filter to SQL for accurate pagination, total, and pages
  - `eb11c6d` docs: reconcile sweeper numbering to Stage 6 and extensions to Stage 7
  - `3dc36bd` fix(permits): map missing comment and completion notes to 422 validation errors per D-005
  - `42eb7d6` test(permits): add HTTP spec-compliance test suite verifying all assignment rules via supertest
- **Verification**:
  - `npm run typecheck` -> 0 errors across all workspaces.
  - `npm run lint` -> clean across all workspaces.
  - `npm test` -> 167/167 tests passing (6 shared + 161 api) across 7 test suites against real PostgreSQL database `ptw_cmms_test`.
- **Decisions**:
  - D-021 (Pending Approval Edit Retention and Approvals Invalidation).
- **Next**: Merge stage/05b-fixes into main, tag stage-05b, and proceed to Stage 6 (node-cron sweeper and POST /internal/sweep).

---

## [2026-11-24 20:30] stage-06 / Background Expiry Sweeper, Internal Endpoints & Distributed Row Locking
- **Goal**: Implement background expiry scheduler with `node-cron`, distributed row-locking with per-permit savepoints in PostgreSQL, internal `POST /internal/sweep` protected by constant-time secret verification, clock injection for deterministic tests, and comprehensive concurrency validation.
- **Done**:
  - Environment Validation (`env.ts`):
    - Configured `SWEEP_SECRET` with minimum 32 characters requirement.
    - Added `SWEEP_CRON_SCHEDULE` with default `'* * * * *'` (60 seconds).
  - Distributed Transaction & Row Locking Engine (`expiry.service.ts` & `transition-engine.ts`):
    - Reused existing `bulkExpireOverduePermits` service without duplicating business logic.
    - Implemented outer transaction holding candidate row locks via `SELECT ... FOR UPDATE SKIP LOCKED` continuously throughout the batch until outer `COMMIT`.
    - Per-permit savepoints (`SAVEPOINT sp_<id>`): prevents partial state, guaranteeing that any individual transition failure rolls back that specific candidate without aborting the batch or leaving a transitioned permit missing its audit entry.
    - Response semantics: returns `{ scanned: number, expiredCount: number, expiredPermitIds: string[] }` strictly guaranteeing `expiredCount === expiredPermitIds.length`.
  - Background Sweeper (`expiry-sweeper.ts`):
    - In-process overlap prevention (`isSweeping` guard + active sweep promise tracking).
    - Injectable clock dependency (`clock: () => Date`) enabling deterministic unit and integration tests.
    - Idempotent `startSweeper()` and safe repeated `stopSweeper()` calls.
    - Cron expression validation (`cron.validate(schedule)`) rejecting invalid expressions before scheduling.
    - Server startup and graceful shutdown in `server.ts` awaiting active sweep completion before process exit.
  - Internal Protected Endpoint (`POST /internal/sweep`):
    - Protected by `X-Sweep-Secret` request header.
    - Timing-safe constant-time verification using `crypto.timingSafeEqual` after checking equal buffer lengths.
    - Zero secret leakage: secrets are never logged or returned in responses.
    - Sanitized identical HTTP 401 response for missing or invalid secrets.
  - Comprehensive Test Suite (`sweeper.test.ts` & `env.test.ts`):
    - 15 real PostgreSQL integration tests in `sweeper.test.ts` covering valid internal sweep, 401s on invalid/missing secrets, automated clock injection, multi-instance concurrency, race conditions with permit extensions, repeated sweeps on already-expired permits, batch savepoint atomicity, invalid cron expression validation, idempotent `startSweeper()`, safe repeated `stopSweeper()`, secret leakage prevention, simultaneous dashboard read concurrency, independent Node.js OS worker process concurrency via spawned child processes, and exact `planned_end == now` inclusive timestamp boundary verification.
    - 8 environment validation unit tests in `env.test.ts` verifying production `SWEEP_SECRET` enforcement (mandatory 32+ character requirement, failure on missing secret, rejection of known dev fallbacks/placeholders, valid production configuration, and safe deterministic fallback in dev/test).
- **Commits**:
  - `3489cbe` feat(config): validate SWEEP_SECRET minimum 32 characters and add SWEEP_CRON_SCHEDULE in environment schema
  - `bb2e5cc` feat(permits): hold row locks across batch and use savepoints in bulkExpireOverduePermits
  - `ab40d79` feat(sweeper): implement background node-cron expiry sweeper with injectable clock and lifecycle management
  - `b53c28c` feat(internal): implement POST /internal/sweep protected by timing-safe X-Sweep-Secret verification
  - `cab7ed0` test(sweeper): add comprehensive test suite for cron sweeper, internal endpoint, and concurrent locking
- **Verification**:
  - `npm run typecheck` -> 0 errors across all workspaces.
  - `npm run build` -> tsc compiled cleanly across all workspaces.
  - `npm test` -> 195/195 tests passing (6 shared + 189 api) across 9 test suites against real PostgreSQL database `ptw_cmms_test`.
- **Decisions**:
  - D-022 (Background Expiry Sweeper, Distributed Row-Locking Architecture & Internal Endpoint Security).
- **Next**: Stage 6 accepted and closed. Proceed to Stage 7 (Complete Frontend Development).

---

## 2026-11-24 - Stage 7: Complete Frontend Application Development

- **Goal**: Build the complete, production-grade responsive React application for the industrial Permit to Work (PTW) CMMS module, implementing all workflows, role-based dashboards, dynamic form rendering from shared schemas, multi-party approvals, live countdowns, work logs, and immutable audit trails.
- **Implemented**:
  - **Premium Industrial Design System & Layout**:
    - Clean industrial palette: Deep Navy sidebar (`#14243A`), Secondary Navy (`#1E344F`), Primary Blue (`#2563EB`), Light Grey canvas (`#F5F7FA`), White surfaces (`#FFFFFF`), Border (`#E2E8F0`), and clear status indicators.
    - Application Shell (`Shell.tsx`) with responsive desktop sidebar and mobile navigation drawer.
    - Role-aware navigation: shows only authorized sections based on authenticated user role.
    - Base UI component library: `Button`, `Input`, `Card`, `StatusBadge` (with animated live pulses), `TypeBadge`, `CountdownTimer`, `Modal`, and `Skeleton`.
  - **Authentication & Centralized Session**:
    - `AuthContext.tsx`: HttpOnly cookie session management (`credentials: 'include'`), auto-hydration on load (`GET /api/auth/me`), and role helpers (`isRequester`, `isAreaOwner`, `isSafetyOfficer`, `isAdmin`).
    - `LoginPage.tsx`: Email/password authentication, password visibility toggle, error alert handling, and one-click reviewer demo account buttons (Requester, Area Owner, Safety Officer, Admin).
  - **Operational Dashboard**:
    - `DashboardPage.tsx`: Top operational statistics (Total, Active, Pending Approvals, Suspended, Expired, Closed).
    - "Active Right Now" live strip with real-time countdown timers ticking every second.
    - "Pending My Approval" section displaying permits awaiting the current user's decision (using backend's `pendingMyApproval`).
    - Recent permit activity stream.
  - **Permit Registry & Search**:
    - `PermitsListPage.tsx`: Server-side filtering by query, permit type, status, area, `mine`, and `pendingMyApproval`.
    - Server-side pagination controls (Previous, Next, Page X of Y, total count).
    - Dense, readable industrial table on desktop and responsive stacked cards on mobile.
  - **Dynamic Form Renderer & Multi-Step Creation**:
    - `DynamicFields.tsx`: Generic, reusable dynamic form renderer driven by `@ptw/shared` registry (`getPermitTypeConfig`). Renders text, number, select, boolean, datetime, list, and multi-gas detector readings.
    - Real-time gas calibration safety threshold warnings (LEL > 10%, O2 < 19.5% or > 23.5%, H2S > 10 ppm, CO > 35 ppm).
    - `CreatePermitPage.tsx`: 5-step form stepper (Type selection cards -> Job & cascading Plant/Area/Equipment location -> Dynamic safety details -> Hazards/PPE/Precautions -> Final review).
    - Dual submit actions: "Save Draft Only" vs "Submit for Approval".
    - Inline server 422 `VALIDATION_ERROR` mapping directly to form controls.
  - **Permit Detail & State Machine Execution**:
    - `PermitDetailPage.tsx`: Header with permit number in prominent mono font, type tile, status pill, and live countdown timer.
    - Action Panel strictly driven by backend `allowedActions` (users never see unauthorized buttons).
    - Confirmation modals for state transitions: approve, reject (mandatory comment), activate, suspend (mandatory reason), resume, close (mandatory completion notes), verify closure, and cancel.
    - Multi-party dual-authorization approval trail (role, reviewer name, status, comment, decision timestamp).
    - Field work logs history + "Add Work Log" dialog when Active.
    - Immutable safety audit timeline displaying actor name + role, action, timestamp, comment, and field diff chips.
  - **Administrative Hierarchy**:
    - `ReferenceDataPage.tsx`: View plants, operational areas with assigned Area Owners, and tagged equipment.
  - **Automated Frontend Test Suite**:
    - 3 Vitest + React Testing Library test suites in `@ptw/web` (10 tests passing): `StatusBadge.test.tsx`, `DynamicFields.test.tsx`, `LoginPage.test.tsx`.
- **Verification**:
  - `npm run typecheck` -> 0 errors across all 3 workspaces (`@ptw/shared`, `@ptw/api`, `@ptw/web`).
  - `npm run build` -> Production bundles compiled cleanly across all workspaces (Vite bundle: 339 kB JS, 31 kB CSS).
  - `npm test` -> 205/205 tests passing (6 shared + 189 api + 10 web) across 12 test suites.
- **Next**: Review frontend delivery report and await user feedback.

---

## 2026-11-25 - Stage 8: Frontend-Backend Integration and QA

- **Goal**: Perform comprehensive full-stack integration audit of frontend, backend, and shared packages; verify and resolve contract mismatches; test all end-to-end user workflows (A through F) and all four permit types against real PostgreSQL database; add automated integration test suites across monorepo.
- **Contract Audit & Resolutions**:
  - Documented complete findings in `docs/STAGE_08_INTEGRATION_AUDIT.md`.
  - **Permit List Envelope Normalization**: Backend returns `{ items: Permit[], pagination: { total, page, limit, totalPages } }`. Normalized in `apps/web/src/api/client.ts` to populate `permits`, `total`, `page`, `limit`, `pages`, restoring permit lists across dashboard strips and permits list table.
  - **Dashboard Stats Normalization**: Computed `total = sum(byStatus)` and provided aliases `activeRightNow: raw.activeNow`, `expiringIn2Hours: raw.expiringIn2h`.
  - **Audit Timeline Retrieval & Display**: Added dedicated `api.getAuditTimeline(id)` calling `GET /api/permits/:id/audit`, rendered `actorName`, `fromValue`, and `toValue` in `PermitDetailPage.tsx`.
  - **Work Logs Payload & Category Alignment**: Aligned client payload to send `{ kind: 'NOTE' | 'ENTRY' | 'EXIT', note: string }` matching DB check constraint, updated category selector, and rendered `log.kind`, `log.loggedByName`, and `log.note`.
  - **Closure Verification Action & Route**: Added `verify` action to `PermitAction` in `@ptw/shared` and aligned client route to `POST /api/permits/:id/verify`.
  - **Close Permit Completion Notes**: Normalized `completionNotes` to `completion_notes` in `api.closePermit()`.
  - **Draft Editing Affordance**: Added "Edit Draft" button and version-locked modal in `PermitDetailPage.tsx` for `DRAFT` and `PENDING_APPROVAL` permits.
  - **Security Hardening**: Guarded reviewer demo account quick-fill buttons in `LoginPage.tsx` with `import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_ACCOUNTS === 'true'`. Created `apps/web/src/vite-env.d.ts`.
- **Automated Integration Tests Added**:
  - `apps/api/src/modules/permits/integration-workflows.test.ts`: 25 comprehensive Supertest integration tests against PostgreSQL:
    - Workflow A: Requester Journey (Draft, Edit via PATCH, Submit, Audit timeline verification).
    - Workflow B: Area Owner Approval (Query `pendingMyApproval`, Review allowed actions, Approve with comment, Verify partial approval state).
    - Workflow C: Safety Officer Approval & Activation (Query pending queue, Approve to reach `APPROVED` status, Activate to `ACTIVE`).
    - Workflow D: Full Lifecycle (Operational work logs on `ACTIVE`, Suspend with comment, Resume, Close with mandatory completion notes, Verify closure sign-off into terminal `CLOSED_VERIFIED` status).
    - Workflow E: Rejection Workflow (Create, Submit, Reject with mandatory comment, Verify requester sees rejected status and comment).
    - Workflow F: Authorization & Role Barriers (Four-Eyes self-approval barrier, Unauthenticated 401, Role-restricted transition barriers with 409, Direct creation role barrier with 403).
    - All 4 Permit Types: Validated dynamic creation, submission, and data persistence for `HOT_WORK`, `CONFINED_SPACE` (including gas test freshness window rule), `WORKING_AT_HEIGHT`, and `ELECTRICAL_LOTO`.
  - `apps/web/src/api/client.test.ts`: 6 client normalization and contract tests.
- **Verification**:
  - `npm run typecheck` -> 0 errors across all 3 workspaces (`@ptw/shared`, `@ptw/api`, `@ptw/web`).
  - `npm run build` -> Clean production build across all workspaces.
  - `npm test` -> 236/236 tests passing (6 shared + 214 api + 16 web) across 14 test files with 0 failures and 0 skipped.
- **Branch & Commit**:
  - Committed on `stage/08-integration-qa` at `d54c5e5`.

---

## Stage 8b & Stage 9: Contract Unification, Error Code Refinement & Deployment Preparation

- **Date**: 2026-11-25
- **Branch**: `stage/08b-cleanup`
- **Activities**:
  1. **Git Commit History Reconciliation**:
     - Added `.gitattributes` enforcing LF line endings (`* text=auto eol=lf`) in commit `51d3768`.
     - Soft-reset monolithic commit `d54c5e5` (`git reset --soft`) and recommitted by logical functional areas.
  2. **Contract Unification & camelCase Enforcement**:
     - Defined comprehensive request/response DTOs in `packages/shared/src/api-types.ts` (`PermitDto`, `PermitDetailResponseDto`, `PermitListResponseDto`, `DashboardStatsDto`, `AuditLogEntryDto`, `PermitWorkLogDto`, `CreatePermitRequest`, `UpdatePermitRequest`, `TransitionActionRequest`).
     - Enforced strict pure `camelCase` for all API schemas, database response mappers, and frontend client calls (`completionNotes`, `plannedStart`, `plannedEnd`, `sortDir`).
     - Removed dead alias `PermitAction.VERIFY_CLOSURE`; unified on `PermitAction.VERIFY = 'verify'`.
     - Deleted all frontend and backend fallback shims (`actorName || actor?.name`, `completion_notes || completionNotes`, `fromStatus || fromValue`, `activeRightNow`, `expiringIn2Hours`, `entryType`, `notes`).
  3. **Granular 403 vs 409 Error Codes**:
     - Updated `transition-engine.ts`, `guards.ts`, and `guard-codes.ts` so authorization/ownership/role barriers return **403 Forbidden** with granular error codes:
       - `SELF_APPROVAL_FORBIDDEN`: Requesters attempting to approve, reject, or verify their own permit.
       - `WRONG_AREA`: Area Owner attempting to approve a permit outside their designated area.
       - `ROLE_NOT_ALLOWED`: Actor role is not permitted for an action available from the current status.
       - `NOT_PERMIT_OWNER`: Requester attempting to edit a permit created by someone else.
     - Reserved **409 ILLEGAL_TRANSITION** strictly for invalid lifecycle state transitions (e.g. activating a DRAFT permit, closing a PENDING_APPROVAL permit, or modifying EXPIRED permits).
     - Added HTTP integration test in `integration-workflows.test.ts` (Workflow G) proving a `SAFETY_OFFICER` who raised a permit cannot approve it (returns 403 `SELF_APPROVAL_FORBIDDEN`), while another approver or admin can sign off.
  4. **Edit Draft Modal Warning**:
     - Updated `PermitDetailPage.tsx` Edit Draft modal to display a prominent warning banner when editing a `PENDING_APPROVAL` permit: *"Saving changes resets all approval tiers to PENDING. Designated approvers must re-authorize."*
     - Added note clarifying that type-specific details and gas readings cannot be altered in this modal.
  5. **Sweep Endpoint Hardening**:
     - Updated `internal.middleware.ts` to compute SHA-256 hashes of both provided and expected secrets before calling `crypto.timingSafeEqual`, eliminating all timing side-channels including string length discrepancies.
     - Added `sweepRateLimiter` (30 requests/minute) using `express-rate-limit`.
  6. **Audit & Known Issues Documentation**:
     - Labeled Section 5 of `docs/STAGE_08_INTEGRATION_AUDIT.md` as UNVERIFIED (Manual audit only; headless browser automated testing not performed in sandbox environment).
     - Recorded Windows Git hook Cygwin/MSYS `sh.exe NtCreateDirectoryObject` error and remote GitHub Actions CI verification in `docs/KNOWN_ISSUES.md`.
     - Updated `docs/API.md` with unified camelCase contracts and refined 403/409 error specifications.
  7. **Stage 9 Deployment Preparation (Render / Neon / Vercel)**:
     - Prepared `render.yaml` for Render Web Service deployment of `@ptw/api` (`node apps/api/dist/server.js`).
     - Prepared `apps/web/vercel.json` and root `vercel.json` with reverse-proxy rewrites (`/api/*` -> Render API) ensuring first-party cookie sessions.
     - Added `db:migrate:remote`, `db:seed:remote`, and `smoke:deploy` scripts in root `package.json`.
     - Created `scripts/post-deploy-smoke.js` automating health checks, 4-role logins, cookie session tests, permit list/stats verification, sweep secret authorization, and 409 transition guard checks.
     - Added comprehensive Production Deployment section in `README.md` with step-by-step checklist, environment variable matrix, and external cron warm-up setup.
- **Verification**:
  - `npm run typecheck` -> 0 errors across `@ptw/shared`, `@ptw/api`, and `@ptw/web`.
  - `npm run build` -> Clean production build across all workspaces.
  - `npm test` -> 239/239 tests passing (6 shared + 217 api + 16 web) across 14 test files with 0 failures.

---

## Stage 10a: Functional Bug Fixes & Contract Resilience

- **Date**: 2026-11-25
- **Branch**: `fix/functional-bugs-1` (branched from `main` at `825a5e6`)
- **Activities**:
  1. **Bug 1: Permit Detail Page Blank Render Crash & Contract Mismatch**:
     - *Reproduction*: Captured unhandled React exception: `Error: Objects are not valid as a React child (found: object with keys {status})` at `PermitDetailPage.tsx:559` when rendering audit trail entries from PostgreSQL `jsonb` objects (`from_value = {"status": "DRAFT"}`). In addition, absence of a top-level `ErrorBoundary` caused the entire React component root to unmount, resulting in a blank white screen. Missing camelCase properties (`permit.requesterName`, `permit.plantName`, `permit.areaName`, `permit.equipmentTag`, `appr.deciderName`, `appr.decidedAt`) failed to render.
     - *Fix*:
       - Added top-level React `ErrorBoundary` in `apps/web/src/components/common/ErrorBoundary.tsx` and wrapped `<Routes>` in `apps/web/src/App.tsx` with friendly recovery actions ("Back to permits", retry button, and dev-only technical details).
       - Added `formatAuditStatus` helper safely extracting status string from either string or JSON object.
       - Corrected flat camelCase properties on `Permit` and `PermitApproval`.
       - Added runtime Zod validation schemas (`permitDetailResponseDtoSchema`, `auditTimelineResponseDtoSchema`, `permitDtoSchema`, etc.) in `packages/shared/src/api-types.ts`.
       - Added component tests in `PermitDetailPage.test.tsx` testing 6 states (`DRAFT`, `PENDING_APPROVAL`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, `CLOSED_VERIFIED`) and 4 roles, plus ErrorBoundary fallback test.
       - Added API contract test `permits.contract.test.ts` validating real `GET /api/permits/:id` and `GET /api/permits/:id/audit` responses against the shared Zod DTO schema.
     - *Commit*: `5c6857f fix(web): resolve PermitDetailPage blank render crash and add ErrorBoundary`
  2. **Bug 2: Equipment Cascade & equipmentId Format Validation**:
     - *Reproduction*: Creating a permit in an area without selecting equipment submitted `equipmentId: ""` (empty string), causing backend 422: `"equipmentId: Invalid equipment ID format"`. Furthermore, omitting `equipmentId` was rejected because `createPermitSchema` required a UUID and the PostgreSQL column had `NOT NULL`.
     - *Fix*:
       - Created database migration `0002_permit_equipment_nullable.sql` altering `permits.equipment_id DROP NOT NULL`.
       - Updated `createPermitSchema` in `permits.schema.ts` to `equipmentId: z.string().uuid().nullable().optional()`.
       - Updated `validateLocationConsistency` in `permit-validation.service.ts` to return clear 422 message `"Select equipment from the chosen area"` when mismatched equipment is sent.
       - Updated `CreatePermitPage.tsx`: removed premature auto-select of plant, implemented clean cascade reset on plant/area changes, updated equipment select to show `"No equipment in this area (optional)"` when an area has zero equipment, and omitted empty string `equipmentId` from API payload.
       - Added component test `CreatePermitPage.test.tsx` testing full cascade loading, plant change reset, zero equipment state, and omitted equipment submission.
       - Added API test `equipment-cascade.test.ts` testing `/api/equipment?areaId=`, empty string 422, null/omitted 201 creation, and mismatched equipment 422.
     - *Commit*: `162d66a fix(permits): fix equipment cascade and omit empty equipmentId`
  3. **Bug 3: Permit List Pagination Next Button & Query Key**:
     - *Reproduction*: In `PermitsListPage.tsx`, `updateFilter` blindly executed `next.set('page', '1')` on every update, so clicking "Next" (`updateFilter('page', '2')`) immediately reverted `page` back to `'1'`, preventing navigation past page 1.
     - *Fix*:
       - Updated `updateFilter` to only reset page to 1 when a filter other than `page` is changed (`if (key !== 'page') next.set('page', '1')`).
       - Synchronized pagination controls with TanStack query key (which includes `page`), and normalized totalPages calculation (`Math.max(1, data?.pagination?.totalPages || 1)`).
       - Added component test `PermitsListPage.test.tsx` verifying navigation from page 1 -> 2 -> 3, disabling Next on page 3, filter reset to page 1, and query key separation.
       - Added API test `permits.pagination.test.ts` verifying `GET /api/permits?page=2&limit=5` returns distinct items from page 1 and accurate pagination metadata.
     - *Commit*: `7820121 fix(web): fix pagination controls and query key synchronization in permits list`
  4. **Client-wide DTO Consistency Audit**:
     - Updated `getPermitStats` in `permits.service.ts` to return `total` alongside `byStatus`, preventing `stats?.total` from evaluating to `undefined` in `DashboardPage.tsx`.
     - Updated `ReferenceDataPage.tsx` and `reference.routes.ts` so area owner uses flat camelCase `ownerName` and `ownerEmail`, and equipment selects both `tag` and `tagNo`.
     - *Commit*: `9ef3777 fix(dto): ensure consistent reference DTO field mapping and stats aggregation across client`
- **Verification**:
  - `npm run typecheck` -> 0 errors across `@ptw/shared`, `@ptw/api`, and `@ptw/web`.
  - `npm run lint` -> 0 errors across all workspaces.
  - `npm run build` -> Clean production build across all workspaces.
  - `npm test` -> 262/262 tests passing (6 shared + 224 api + 32 web) across 20 test files with 0 failures.
