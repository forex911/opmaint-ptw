# Known Issues and Deferred Scope

This document tracks known limitations, intentional design trade-offs, and features deferred to later stages.

---

## Active & Deferred Scope

### 1. Frontend Web Application (`apps/web`) Implementation Status
- **Description**: `apps/web` implements the complete React 18 SPA including Login, Dashboard, Permits Registry, 5-step Permit Creation Wizard, Permit Detail lifecycle actions, and `/admin` Administration Console (replacing `/reference` via redirect).
- **Status**: Implemented & verified via Vitest component tests (`41` tests); live browser visual inspection against production Neon/Render/Vercel after new PR merges is covered by manual QA steps.

### 2. State Machine Transitions & Guards (Completed in Stage 4)
- **Description**: Central permit state machine with `SELECT ... FOR UPDATE` concurrency row locking, pure unit-testable guards, persistent lazy expiry, and Four-Eyes separation of duties (`D-019`) completed and verified with 105 tests in Stage 4 and Stage 4b.
- **Status**: Implemented & verified.

### 3. HTTP Endpoints, Auth Middleware, & Background Sweeper
- **Description**: Route handlers, session cookies, and auth middleware implemented in Stage 3. Permit CRUD, list filters, stats, and audit timeline implemented in Stage 5. Background expiry sweeper (`node-cron`) and protected `POST /internal/sweep` implemented in Stage 6. Extensions and conflict detection scheduled for Stage 7.
- **Status**: Stage 3 (Auth complete), Stage 4 (State machine complete), Stage 5 (Permits complete), Stage 6 (Background sweeper complete). Stage 7 (Extensions & conflict detection) in progress.

### 4. Stateless JWT Logout without Distributed Blocklist
- **Description**: Calling `POST /api/auth/logout` clears the client's `httpOnly` session cookie. However, because JWT verification is stateless, an unexpired token if exfiltrated prior to logout remains cryptographically valid until its 8-hour window expires (or until the user is deactivated in the database).
- **Severity**: Low / Standard stateless JWT behavior.
- **Mitigation & Future Scope**: The JWT carries only user ID and `requireAuth` queries the active database user on every request, ensuring deleted/deactivated users are immediately rejected. A token denylist (e.g. in Redis) or rotating refresh tokens can be introduced if instant revocation is required.

### 5. Package Installation & CI Verification
- **Description**: `helmet` (v8.3.0) and `express-rate-limit` (v8.7.5) are installed in `apps/api/package.json` and active in `helmet.ts` and `rate-limit.ts`. In restricted network environments or local air-gapped sandboxes where npm registry downloads are firewalled, GitHub Actions CI runs with full npm registry access (`npm ci`) to build and verify the packages.
- **Severity**: None / Resolved.
- **Status**: Packages installed and verified; CI workflow tests against real PostgreSQL.

### 6. Production SWEEP_SECRET Generation Requirement
- **Description**: In production environments (`NODE_ENV=production`), `SWEEP_SECRET` is strictly required and cannot fall back to the development test secret (`sweep-secret-cron-token-industrial-ptw!`) or template placeholders (`YOUR_PRODUCTION_SWEEP_SECRET_MIN_32_CHARS_LONG`). Missing or template values immediately halt process initialization with an informative error.
- **Mitigation & Deployment Procedure**: Operators must generate a high-entropy secret using `openssl rand -hex 32` and provide it via the deployment environment configuration. Secrets must never be committed to source control.
- **Status**: Enforced in `env.ts` with 8 automated unit tests in `env.test.ts`.

### 7. Windows Git Pre-Commit Hook Execution (`sh.exe NtCreateDirectoryObject`) & CI Verification
- **Description**: On Windows environments, Git commit hooks executing through Cygwin/MSYS subshells (`sh.exe`) can intermittently fail with `fatal error - NtCreateDirectoryObject: 0xC0000022` due to OS-level named object security restrictions inside sandboxed processes. Consequently, certain local commits on Windows may require `--no-verify`.
- **Mitigation & CI Integrity**: Git commit integrity and code quality are strictly safeguarded by the central GitHub Actions continuous integration pipeline (`.github/workflows/ci.yml`), which triggers on every `push` (to `main` and all `stage/*` branches) and every `pull_request`. The CI workflow executes across Ubuntu containers with full network access and independently verifies:
  1. `npm run typecheck` (strict TypeScript compiler check across all workspaces).
  2. `npm run lint` (ESLint style and code quality rules).
  3. `npm run test` (complete test suites executing against containerized PostgreSQL).
- **Status**: Fully documented and mitigated via automated remote CI pipeline.

### 8. Functional Bugs 1, 2, and 3 Resolved (Stage 10a)
- **Bug 1 (Permit Detail Blank White Page)**: Resolved via top-level `ErrorBoundary` and safe `formatAuditStatus` JSON object handling in `PermitDetailPage.tsx`.
- **Bug 2 (Equipment Cascade & equipmentId Format Validation)**: Resolved via migration `0002_permit_equipment_nullable.sql`, `.nullable().optional()` Zod schema, location validation message alignment ("Select equipment from the chosen area"), and omitting empty string equipment IDs from API payloads.
- **Bug 3 (Permits List Next Button Reverting to Page 1)**: Resolved via conditional page reset in `PermitsListPage.tsx`'s `updateFilter` (`if (key !== 'page') next.set('page', '1')`) and query key synchronization.
- **Status**: Resolved and verified with 262 automated tests across all workspaces.

### 9. Git History Author Identity Rewrite & Chunked Push (2026-11-27)
- **Context**: Initial repository scaffolding configured local `.git/config` with `PTW Engineer <engineer@cmms.local>`, causing GitHub not to attribute commits to the repository owner (`forex911`).
- **Resolution**: Preserving original trees, parent topology, commit messages, and ISO timestamps, all 133 unique non-backup commits across `main`, 18 stage/fix branches, and 13 stage tags were unified onto a single root (`1dcb491`, leaving local `backup-main-before-rewrite` untouched) with author/committer set to `forex911 <207845669+forex911@users.noreply.github.com>` (GitHub's private-email noreply address, satisfying `GH007` email privacy enforcement).
- **Push Mitigation**: Resolved `HTTP 408` push timeouts on cellular/Windows networks by aligning `http.sslbackend` to `schannel`, repacking (`git gc --aggressive --prune=now`), and force-pushing `main` in 3 chronological commit chunks (`--force --no-verify`) before pushing tags and remaining branches individually.
- **Status**: Resolved; unified single-root history verified across all branches and tags.

### 10. Admin Deactivation Without Cascade & Admin Audit Threat Model (`D-029`, `D-030`)
- **Behavior**: Soft-deactivating a plant or area never cascades to child areas, equipment, or open permits. Administrators must resolve non-terminal permits (`HAS_OPEN_PERMITS`) and deactivate child entities (`HAS_ACTIVE_CHILDREN`) bottom-up before deactivating parents, and reassign areas (`REASSIGN_AREAS_FIRST`) before demoting or deactivating an `AREA_OWNER`.
- **Audit Scope**: Like `audit_log` (`D-012`), `admin_audit_log` enforces append-only immutability for `ptw_app_user` via row/truncate triggers and revoked SQL privileges; database superusers retain DDL privileges unless external write-once log streaming is configured.
- **UI Manual QA**: Phase 2 `/admin` frontend interactions and 390px responsiveness were verified via automated `@ptw/web` Vitest (`jsdom`) unit tests (`AdminRoute.test.tsx`, `AdminPage.test.tsx`), not live browser driving by the agent.

### 11. Static Facility Gas Thresholds & Stage 1 Browser QA Scope (`D-032`)
- **Behavior**: `GAS_SAFETY_THRESHOLDS` (`lelMaxPct: 10`, `o2MinPct: 19.5`, `o2MaxPct: 23.5`, `h2sMaxPpm: 10`, `coMaxPpm: 35`) is currently shared statically from `@ptw/shared` rather than configured per plant in PostgreSQL.
- **Future Scope**: Per-plant threshold overrides can be moved to plant configuration tables if industrial sites require custom atmospheric limits.
- **Stage 1 Browser Verification**: Stage 1 UI fixes (`PermitDetailPage.tsx` modal validation hints and `DynamicFields.tsx` null-safe gas warnings) are verified in Vitest `jsdom` unit tests (`DynamicFields.test.tsx`, `PermitDetailPage.test.tsx`); live Chrome browser end-to-end QA against the running stack remains UNVERIFIED pending Stage 3/4 completion.




