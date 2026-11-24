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
- **Verification**:
  - `npm run --workspace=@ptw/shared build` -> tsc compiled clean
  - `npm run --workspace=@ptw/shared test` -> 6/6 tests passed (HOT_WORK submit/draft, CONFINED_SPACE timing rules, EXCAVATION dynamic registration)
  - `npm run --workspace=@ptw/api build` -> tsc compiled clean
  - `npm run --workspace=@ptw/api test` -> 1/1 tests passed (env validation)
  - Root `npm run build && npm run test` -> 7/7 tests passed across all workspaces
- **Decisions**:
  - D-001 (npm workspaces)
  - D-002 (`bcryptjs` for Windows/container reliability)
  - D-003 (Dynamic registry and Zod schema generation)
  - D-004 (60-minute pre-entry gas test window)
  - D-005 (Standardized error envelope)
  - D-006 (State machine transactional concurrency via `SELECT ... FOR UPDATE`)
  - D-007 (Database trigger for audit log immutability)
  - D-008 (Dual-tier lazy + sweeper expiry)
  - D-009 (Permit human-readable ID format)
- **Next**: Finalize git ceremony, CI hooks, and advance to Stage 2 (Database schema, Drizzle migrations, audit triggers, and idempotent seed script).
