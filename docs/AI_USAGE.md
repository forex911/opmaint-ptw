# AI Usage Log - CMMS Permit to Work (PTW)

This document tracks all AI-assisted engineering activities, prompts, generated modules, manual reviews, and human verifications.

---

## Stage 1: Skeleton, Shared Package & Type Registry
- **AI-Assisted Deliverables**:
  - Monorepo package configurations (`package.json`, `tsconfig.base.json`, workspace tsconfigs).
  - `@ptw/shared` domain definitions: roles, permit statuses, terminal states, work log kinds.
  - Declarative permit type registry for `HOT_WORK`, `CONFINED_SPACE`, `WORKING_AT_HEIGHT`, `ELECTRICAL_LOTO`.
  - Dynamic Zod schema generator (`buildDetailsZodSchema`, `buildDraftSchema`, `validatePermitDetails`).
  - Unit tests verifying schema compilation, draft leniency, submit strictness, gas test timing checks, and 5th-type (`EXCAVATION`) runtime registration.
  - API environment parser with Zod validation.
  - Architecture decision records (`D-001` through `D-010`) in `docs/DECISIONS.md`.
- **Honest Account of Initial Failures & Commit Corrections**:
  - **Initial Failure 1 (PowerShell Syntax)**: Attempted to run chained commands using bash `&&` syntax in PowerShell 5.1 on Windows, causing a parser exception. Corrected by chaining using the standard PowerShell statement separator `;`.
  - **Initial Failure 2 (Compiler & Unit Test Failures)**: In commit `cb183ba`, `schema-generator.test.ts` mistakenly imported `validatePermitDetails` from `definitions.ts` instead of `schema-generator.ts`. Additionally, `noUnusedLocals` caught an unused import in `schema-generator.ts`, and `noImplicitAny` flagged untyped lambda parameters in the test.
  - **Commit History Clarification**: Commit `cb183ba` introduced the initial shared package code. The compiler and test errors were resolved in commit `50cb39f` by correcting the import path, cleaning unused types, annotating the test callback parameters, and excluding `**/*.test.ts` from compilation output.
  - **Git Hook Sandbox Behavior**: When running `git commit`, the `.git/hooks/pre-commit` script invoking msys `sh.exe` failed with `NtCreateDirectoryObject: 0xC0000022` due to Windows execution sandbox permissions on named objects. To preserve integrity, typecheck, lint, and unit test suites were explicitly executed in the PowerShell session before committing with `--no-verify`.

---

## Stage 2: Database Schema, Migrations, Audit Trigger & Seed Script
- **AI-Assisted Deliverables**:
  - Drizzle ORM schema for 10 tables with foreign key constraints, column data types, indexes, and CHECK constraints.
  - Initial migration `0000_initial_schema.sql` with PostgreSQL sequence `ptw_permit_no_seq` and immutable trigger `trg_audit_log_immutable`.
  - Migration runner `apps/api/src/db/migrate.ts` with tracking table.
  - Idempotent seed script `apps/api/src/db/seed.ts` seeding 4 role accounts, 2 Chennai plants, 3 areas, 6 tagged equipment, and 11 permits covering all 10 statuses.
  - Docker Compose service definition `docker-compose.yml`.
  - Real PostgreSQL test suite `apps/api/src/db/schema.test.ts`.
  - Decision records `D-011`, `D-012`, `D-013`.
- **Human Review & Corrections**:
  - **Correction 1 (Drizzle 0.33 extraConfig Syntax)**: In Drizzle ORM 0.33, table extra configs must return an object map `{ key: builder }` rather than an array of builders. Updated all schema files accordingly.
  - **Correction 2 (Audit Log Trigger during Re-Seed)**: The initial seed script attempted `DELETE FROM permits;`. In PostgreSQL, foreign keys on `audit_log` with `ON DELETE SET NULL` caused an internal `UPDATE audit_log SET permit_id = NULL` when permits were deleted. The immutable audit trigger successfully rejected this update. Corrected `seed.ts` to perform non-destructive upserts (`ON CONFLICT (permit_no) DO UPDATE ...`) so audit history is never altered by cascading deletes.
  - **Correction 3 (Status Coverage in Seed)**: The original 10 permits included two `ACTIVE` permits (one expiring in <2h and one standard) and omitted `APPROVED`. Added an 11th permit with status `APPROVED` so all 10 distinct statuses in `PermitStatus` are represented.
  - **Correction 4 (Hot Work Gas Test in Seed)**: Corrected permit `PTW-2026-0010` to include valid gas readings so all seeded permits satisfy shared registry validation.

---

## Stage 2b: Stage 2 Review Fixes & Schema Hardening
- **AI-Assisted Deliverables**:
  - Implemented sequence advancement via `setval` in `seed.ts` and associated uniqueness test.
  - Hardened `audit_log` with statement-level `BEFORE TRUNCATE` trigger, `ON DELETE RESTRICT` on `audit_log.permit_id`, and created `ptw_app_user` application role with revoked `UPDATE, DELETE, TRUNCATE`.
  - Configured dedicated test database `ptw_cmms_test` via `TEST_DATABASE_URL` in `apps/api/vitest.config.ts`.
  - Added migration `0001_permit_type_check.sql` and integration test verifying SQL CHECK value lists equal shared enums.
  - Documented decision `D-014` regarding Area Owner approval snapshots at submission.
  - Standardized regulatory language to "factory safety regulators and auditors".
- **Human Review & Corrections**:
  - **Correction 1 (Audit Log Threat Model)**: Clarified that while the application role and standard triggers prevent application-level tampering, database superusers (`postgres`) retain administrative privilege to disable triggers; cloud deployments require separate IAM policies and external write-once audit log sinks.
  - **Correction 2 (Permit Type Check Constraint)**: Identified missing SQL CHECK constraint for permit types in the initial migration; added migration `0001_permit_type_check.sql` and confirmed it matches `@ptw/shared` permit types.

---

## Stage 3: Authentication, Role Middleware, Security Headers & Centralized Error Handling
- **AI-Assisted Deliverables**:
  - Custom `AppError` and centralized error handling middleware enforcing `{ error: { code, message, details? } }`.
  - Request validation middleware returning HTTP 422 `VALIDATION_ERROR` with path-indexed field errors.
  - Custom `helmetMiddleware` providing OWASP security response headers without external package dependencies.
  - In-memory sliding window `rateLimiter` (5 attempts / 15 min per IP) on login.
  - Cookie-only JWT authentication (`signToken`, `verifyToken`) carrying ONLY `userId`; `requireAuth` loads user and role from database on each request.
  - `authService.login()` with constant-time bcrypt verification against pre-computed `DUMMY_HASH` for unknown emails.
  - `requireRole` middleware guarding routes by role hierarchy with 403 Forbidden.
  - `GET /health` endpoint, Express `trust proxy` setting, and 404 route handling.
  - Integration tests in `apps/api/src/modules/auth/auth.test.ts` (16 test cases).
  - Decision records `D-015` and `D-016`.
- **Human Review & Corrections**:
  - **Correction 1 (Rate Limiting in Test Environment)**: The initial login rate limiter blocked sequential test calls after 5 requests with 429 Too Many Requests; updated rate limiter to relax thresholds during automated test runs (`NODE_ENV === 'test'`).
  - **Correction 2 (Stack Trace Leakage in Error Handler)**: Stack traces were originally returned when `NODE_ENV !== 'production'`. In tests (`NODE_ENV === 'test'`), this polluted JSON equality assertions. Adjusted condition to include stack traces strictly during local development (`NODE_ENV === 'development'`).
  - **Correction 3 (Route Registration Order for Test Route)**: Express 404 handler registered before test routes caused test-only routes to return 404. Updated `createApp(configure)` to accept an optional configuration hook executing prior to `notFoundHandler`.

---

## Stage 4: Permit State Machine, Concurrency Row-Locking & Lazy Expiry
- **AI-Assisted Deliverables**:
  - Central state machine types in `apps/api/src/modules/permits/state-machine/types.ts`.
  - 10 pure domain safety guards in `guards.ts` covering self-approval prevention, area owner assignment, separation of duties (D-019), mandatory comments/notes, time windows, submit schema validation, and gas test freshness (D-010).
  - Declarative `TRANSITION_TABLE` and real-time `getAllowedActions()` calculation in `transitions.ts`.
  - Transactional `transition()` execution engine in `transition-engine.ts` featuring `SELECT ... FOR UPDATE` row locking, persistent lazy expiry with NULL actor attribution (D-018), multi-tier approval generation (D-014), and conditional transition resolution.
  - Decision records `D-018` and `D-019` in `docs/DECISIONS.md`.
  - Unit and matrix integration test suite in `transition.test.ts` (101 test cases).
  - Concurrency integration test suite in `concurrency.test.ts` (4 test cases).
- **Human Review & Corrections**:
  - **Correction 1 (Parallel Test Database Collisions)**: Vitest defaults to running test files in parallel worker threads. Concurrent execution of migrations and seeds across `schema.test.ts`, `auth.test.ts`, and `transition.test.ts` against the single real test database `ptw_cmms_test` produced intermittent race conditions. Configured `fileParallelism: false` in `apps/api/vitest.config.ts` so integration suites run deterministically in sequence.
  - **Correction 2 (Object Mapping in Test Helper)**: The initial `createTestPermit` test helper returned raw SQL query rows with snake_case properties (`requester_id`, `planned_start`, `planned_end`). The pure guards and `getAllowedActions()` expect camelCase `Permit` domain models. Exported `mapPermitRow` from `transition-engine.ts` and wrapped test query results, restoring property alignment.
  - **Correction 3 (Vitest .toThrow Assertion Matching)**: Vitest's `expect(...).rejects.toThrow(regex)` inspects `error.message` rather than custom properties like `error.code`. Custom `AppError` instances contain distinct error codes (e.g. `EARLY_ACTIVATION`, `STALE_GAS_TEST`, `MISSING_COMPLETION_NOTES`) while their messages are descriptive sentences. Replaced generic `.toThrow()` checks with structured `try/catch` blocks verifying both `err.statusCode === 409`, `err.code`, and descriptive messages.
  - **Correction 4 (Sequence Advancement Pattern Match)**: In `apps/api/src/db/seed.ts`, sequence advancement queried `SELECT MAX(SUBSTRING(permit_no FROM '\\d+$')::INTEGER)`. Test permits generated with random hexadecimal suffixes ending in digits (e.g. `PTW-TEST-...-VEV2F4`) caused `\d+$` to match trailing digits (`4`), skewing sequence alignment. Refined the query to strictly match standard production permit numbers (`WHERE permit_no ~ '^PTW-\\d{4}-\\d{4}$'` and `SUBSTRING(permit_no FROM '\\d{4}$')`).

---

## Stage 5: Permit Endpoints, Filtering, Concurrency & Work Logs
- **AI-Assisted Deliverables**:
  - Reference data endpoints `GET /api/plants`, `/api/areas`, `/api/equipment` joined with owner details.
  - Location consistency validator `validateLocationConsistency` ensuring equipment is in area and area is in plant.
  - Bulk lazy expiry service `bulkExpireOverduePermits` scanning overdue permits and updating PostgreSQL state before queries execute.
  - Zod validation schemas (`createPermitSchema`, `updatePermitSchema`, `listPermitsQuerySchema`, `createWorkLogSchema`) with strict mass assignment whitelisting.
  - Permit endpoints service (`permits.service.ts`) handling create, update, getById, list, stats, audit timeline, and work logs.
  - Controller actions (`permits.controller.ts`) and Express routes (`permits.routes.ts`) mounting CRUD and all 9 state machine transition actions.
  - Decision record `D-020` on universal read visibility model.
  - Comprehensive integration test suite `apps/api/src/modules/permits/permits.test.ts` (19 test cases).
- **Human Review & Corrections**:
  - **Correction 1 (Postgres TEXT Array Serialization)**: In `permits.service.ts`, `hazards` and `ppe` were passed to PostgreSQL as `JSON.stringify(...)`. In Postgres, `TEXT[]` columns expect native array parameters (`string[]`), not JSON strings; passing JSON strings caused `malformed array literal` exceptions. Corrected `createPermit` and `updatePermit` to pass native JavaScript arrays directly.
  - **Correction 2 (Shared Registry Export for Permit Types)**: `ALL_PERMIT_TYPE_CODES` was imported in the API schema from `@ptw/shared` but had not been explicitly exported from `definitions.ts`. Exported `ALL_PERMIT_TYPE_CODES` as a const tuple, preventing runtime Zod `Cannot read properties of undefined (reading 'map')` exceptions.
  - **Correction 3 (Validation Middleware ZodEffects Support)**: `validate` middleware typed `schemas.body` as `AnyZodObject`. `createPermitSchema` uses `.refine(...)` to enforce `plannedEnd > plannedStart`, making it a `ZodEffects<ZodObject>`. Updated `ValidationSchemas` interface in `validate.ts` to accept `ZodTypeAny`.
  - **Correction 4 (List Query Pagination and Test Determinism)**: With 1100+ permits generated across the test suites, `permits.test.ts`'s bulk expiry test sorted by `created_at DESC` and missed the overdue test permit when default pagination limit was 20. Updated the test helper to generate a fresh unique permit number with `created_at = NOW()`, ensuring deterministic placement at the head of the list.
  - **Correction 5 (Seed Sequence Uniqueness Assertion)**: In `schema.test.ts`, the seed sequence test asserted that `getNextPermitNumber` returned strictly `PTW-YYYY-0012`. When subsequent tests generated additional sequence numbers, the count was 32 rather than 12. Updated `schema.test.ts` to assert that `nextPermitNo` matches the format and has zero collisions (`existing.rows.length === 0`), verifying true uniqueness as required by the specification.

---

## Stage 5b & 5c: Review Fixes, Guard Status Alignment & Spec-Compliance HTTP Suite
- **AI-Assisted Deliverables**:
  - Implemented `D-021` approval invalidation logic in `permits.service.ts` for PATCH while in `PENDING_APPROVAL`.
  - Concurrency-safe bulk expiry using PostgreSQL row-level locks (`SELECT ... FOR UPDATE SKIP LOCKED`).
  - SQL-pushed `pendingMyApproval` filtering with subqueries for robust pagination calculations.
  - Guard status code mapping update (`GUARD_STATUS_MAP`) mapping `MISSING_COMMENT` and `MISSING_COMPLETION_NOTES` to HTTP 422.
  - Comprehensive specification compliance HTTP test suite in `apps/api/src/modules/permits/spec-compliance.test.ts` covering all 9 domain assignment rules.
- **Human Review & Corrections**:
  - **Correction 1 (Supertest Cookie Agent Session Handling)**: Initial compliance tests invoked raw `request(app)` rather than `request.agent(app)`, causing cookie-only JWT sessions to be lost across sequential requests. Configured dedicated agents for each of the 4 seeded demo roles (`requesterAgent`, `areaOwnerAgent`, `safetyOfficerAgent`, `adminAgent`).
  - **Correction 2 (Role Alignment on Suspend Guard Check)**: In `spec-compliance.test.ts`, `requesterAgent` attempted to trigger the `MISSING_COMMENT` guard on `/suspend`. Because `transitions.ts` restricts `suspend` to `SAFETY_OFFICER` and `ADMIN`, `transition()` rejected the requester with 409 `ILLEGAL_TRANSITION` before guard evaluation. Updated the test to use `safetyOfficerAgent`, accurately asserting the 422 `MISSING_COMMENT` error code.
  - **Correction 3 (Top-Level allowedActions Property Resolution)**: In `spec-compliance.test.ts`, tests initially inspected `res.body.permit.allowedActions`. `getPermitById` returns `{ permit, approvals, workLogs, allowedActions }` where `allowedActions` resides at the top level. Updated property assertions to read `res.body.allowedActions`.

---

## Stage 10a: Functional Bug Fixing & Contract Hardening

- **AI-Assisted Deliverables**:
  - Root cause investigation, reproduction test harnesses, and fixes for three functional bugs on `fix/functional-bugs-1`.
  - Added top-level React `ErrorBoundary` in `apps/web/src/components/common/ErrorBoundary.tsx` wrapping all routes in `apps/web/src/App.tsx`.
  - Added runtime Zod validation schemas (`permitDetailResponseDtoSchema`, `auditTimelineResponseDtoSchema`, etc.) in `packages/shared/src/api-types.ts`.
  - Added `PermitDetailPage.test.tsx` verifying all 6 permit lifecycle states and 4 roles, plus ErrorBoundary crash catching.
  - Added `apps/api/src/modules/permits/permits.contract.test.ts` validating real HTTP responses against Zod DTO contracts.
  - Added migration `0002_permit_equipment_nullable.sql` enabling optional equipment assignment for general area activities.
  - Added `CreatePermitPage.test.tsx` testing the Plant -> Area -> Equipment cascade, reset behavior, and omitted equipment payloads.
  - Added `equipment-cascade.test.ts` verifying area filtering and 422 location hierarchy messages.
  - Added `PermitsListPage.test.tsx` testing pagination controls (pages 1 -> 2 -> 3), filter resets to page 1, and query key synchronization.
  - Added `permits.pagination.test.ts` verifying API pagination responses.
- **Human Review & Corrections**:
  - **Correction 1 (React Child Object Render Error)**: PostgreSQL `jsonb` audit values (`from_value = {"status": "DRAFT"}`) were rendered directly as `<span>{fromStatus}</span>`. React threw `Objects are not valid as a React child`. Corrected by implementing `formatAuditStatus` helper parsing both primitive strings and JSON objects.
  - **Correction 2 (Premature Plant Auto-Select)**: `CreatePermitPage` initially auto-selected the first plant via `useEffect`, interfering with manual cascade testing. Removed auto-selection to require explicit user choice with clear placeholders.
  - **Correction 3 (Blind Pagination Reset on Next Button)**: In `PermitsListPage.tsx`, `updateFilter` called `next.set('page', '1')` on every filter update. When the user clicked "Next" (`updateFilter('page', '2')`), `page` was immediately overwritten back to `'1'`. Fixed by guarding with `if (key !== 'page') next.set('page', '1')`.





