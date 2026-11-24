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
- **Next**: Merge into main, tag `stage-03`, and await user approval to begin Stage 4 (State Machine & Concurrency Engine).
