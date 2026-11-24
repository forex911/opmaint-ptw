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
- **Next**: Stage 3 (Auth, role middleware, and error handling).
