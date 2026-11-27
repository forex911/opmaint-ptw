# Architecture Decision Records (ADRs) - CMMS Permit to Work (PTW)

This log records every architectural decision, rejected alternative, and trade-off for the PTW module. Every line must be defensible in code reviews and plant safety audits.

---

### D-001 Monorepo Architecture and npm Workspaces Choice
- **Context**: The PTW module requires shared domain types, enums, and a dynamic permit type registry shared between backend services (`/apps/api`), future client frontends (`/apps/web`), and CLI/sweeper tasks.
- **Options considered**:
  - *Option A*: Single unified monolithic directory (no workspace separation).
  - *Option B*: pnpm workspaces with strict symlinking.
  - *Option C*: npm workspaces (`packages/*`, `apps/*`).
- **Decision**: Option C — Standard npm workspaces with Node 20+ and native ESM (`"type": "module"`).
- **Consequences**: Avoids external host tool prerequisites (pnpm/yarn) on developer machines and Windows environments while providing clean package boundary separation (`@ptw/shared`, `@ptw/api`).
- **Status**: Accepted

---

### D-002 Password Hashing Library Selection (`bcryptjs`)
- **Context**: User authentication requires secure, one-way password hashing. The project specification allows either argon2 or bcrypt.
- **Options considered**:
  - *Option A*: `argon2` via native C++ bindings (`node-gyp`).
  - *Option B*: `bcrypt` via native C++ bindings.
  - *Option C*: `bcryptjs` (pure JS implementation with standard bcrypt algorithm and salt rounds).
- **Decision**: Option C — Use `bcryptjs` with 10 salt rounds.
- **Consequences**: Guarantees deterministic, compilation-free installation on Windows workstations and minimal Docker container environments, completely eliminating MSBuild/node-gyp runtime errors while maintaining full cryptographic compatibility with bcrypt.
- **Status**: Accepted

---

### D-003 Dynamic Permit Type Registry and Dynamic Zod Schema Generator
- **Context**: Hazardous work in industrial plants spans distinct categories (Hot Work, Confined Space, Working at Height, Electrical LOTO) each with unique fields. Adding new types (e.g., Excavation) must never require new tables, new endpoints, or duplicated code.
- **Options considered**:
  - *Option A*: Separate database tables for each permit type (`permits_hot_work`, `permits_confined_space`).
  - *Option B*: Hardcoded static Zod schemas with union types in API controllers.
  - *Option C*: Core `permits` table with `details` JSONB column validated dynamically via a declarative registry (`FieldDefinition[]` and `PermitTypeConfig`).
- **Decision**: Option C — Maintain a declarative permit type registry in `/packages/shared` and compile dynamic Zod schemas for both `draft` (permissive) and `submit` (strict) validation modes.
- **Consequences**: Enables zero-code-change extensibility. Adding a 5th permit type (e.g., Excavation) requires only registering a config object with its fields and rules.
- **Status**: Accepted

---

### D-004 Confined Space Pre-Entry Gas Test 60-Minute Timing Rule at Submission
- **Context**: Atmospheric conditions in confined spaces can degrade rapidly due to toxic gas ingress (H2S, CO) or oxygen depletion. The spec requires a gas test less than 60 minutes before planned start.
- **Options considered**:
  - *Option A*: Frontend-only time check during form submission.
  - *Option B*: Server-side validation during `submit` enforcing `planned_start - tested_at <= 60 minutes` (with bounds check preventing future timestamps).
- **Decision**: Option B — Declarative type rule in the permit type config executed on the backend during permit submission.
- **Consequences**: Stale atmospheric tests (>60 minutes prior to planned start) are rejected with error code `ATMOSPHERE_TEST_STALE`, preventing entry based on outdated atmospheric data.
- **Status**: Accepted

---

### D-005 Strict Error Response Envelope and Machine-Readable Error Codes
- **Context**: Client applications and automated audit monitors require deterministic error formats rather than varying Express error shapes.
- **Options considered**:
  - *Option A*: Standard Express default HTML/string error responses.
  - *Option B*: Unified JSON error envelope: `{ error: { code, message, details } }`.
- **Decision**: Option B — All non-2xx API responses return `{ error: { code, message, details } }`. Specific codes: `UNAUTHENTICATED` (401), `FORBIDDEN` (403 with specific sub-codes), `NOT_FOUND` (404), `ILLEGAL_TRANSITION` (409 with `from`, `action`, `allowedActions`), `VALIDATION_ERROR` (422 with field paths).
- **Consequences**: Centralized error middleware ensures no raw database or system stack traces leak to users while giving clients structured error codes for UI mapping.
- **Status**: Accepted

---

### D-006 State Machine Concurrency Control and Single-Point Entry (`SELECT ... FOR UPDATE`)
- **Context**: Industrial permits involve life-critical transitions. Race conditions (e.g. concurrent approvals or activation after cancellation) could result in unauthorized work.
- **Options considered**:
  - *Option A*: Ad-hoc update queries in individual route handlers.
  - *Option B*: Single declarative transition table and centralized `transition(permitId, action, actor, payload)` function running inside a database transaction with `SELECT ... FOR UPDATE`.
- **Decision**: Option B — All lifecycle actions must pass through `transition()`, acquiring a row-level lock on the permit row before evaluating guards and persisting state.
- **Consequences**: Eliminates concurrency anomalies, guarantees atomic audit logging, and enforces that endpoints cannot write status directly.
- **Status**: Accepted

---

### D-007 Append-Only Immutable Audit Log via Database Triggers
- **Context**: In safety investigations, regulatory bodies demand proof of who authorized what. Application-level checks alone can be bypassed via direct database access.
- **Options considered**:
  - *Option A*: Application ORM-level insert-only conventions.
  - *Option B*: PostgreSQL database trigger `BEFORE UPDATE OR DELETE ON audit_log RAISE EXCEPTION`.
- **Decision**: Option B — Database-level trigger on the `audit_log` table forbidding UPDATE and DELETE operations.
- **Consequences**: The audit log is tamper-proof at the database engine level.
- **Status**: Accepted

---

### D-008 Dual-Tier Expiry Strategy (Lazy Expiry + Sweeper Webhook)
- **Context**: Permits must transition to `EXPIRED` once `now > planned_end`. Cloud instances may sleep background timers.
- **Options considered**:
  - *Option A*: Background cron job only.
  - *Option B*: Real-time database scheduler.
  - *Option C*: Dual-tier approach: (1) Lazy expiry on every read and state transition, and (2) Active sweeper via `node-cron` backed by a protected external webhook `POST /internal/sweep` with `X-Sweep-Secret`.
- **Decision**: Option C — Two-tier lazy expiry plus dual-channel active sweeper.
- **Consequences**: An expired permit can never be interacted with even if background workers sleep, while scheduled sweeps keep dashboards accurate.
- **Status**: Accepted

---

### D-009 Human-Readable Permit Identification Format (`PTW-YYYY-NNNN`)
- **Context**: Plant technicians and safety officers reference permits on radios and physical permit boards by short, sequential identifiers.
- **Options considered**:
  - *Option A*: Raw UUIDs (e.g. `c7a3b4...`).
  - *Option B*: Timestamp string (e.g. `20261124115500`).
  - *Option C*: Formatted sequential tag `PTW-YYYY-NNNN` (e.g. `PTW-2026-0001`).
- **Decision**: Option C — Year-prefixed sequential human-readable tag.
- **Consequences**: Verbal communication is clear during shift handovers and emergency isolations.
- **Status**: Accepted

---

### D-010 Confined Space Atmosphere Re-Verification at Activation
- **Context**: In real-world plant operations, a Confined Space permit may be submitted and approved hours before actual job execution begins. Atmospheric conditions inside a vessel or tank can deteriorate while waiting for activation.
- **Options considered**:
  - *Option A*: Validate atmospheric test only at permit submission.
  - *Option B*: Enforce that during `activate`, if the permit type is `CONFINED_SPACE`, the atmosphere test timestamp must be fresh (`now - tested_at <= 60 minutes`). If more than 60 minutes have elapsed between testing and activation, activation is blocked until fresh readings are recorded.
- **Decision**: Option B — Server-side guard on the `activate` transition verifies that `CONFINED_SPACE` permits have an atmosphere test recorded within 60 minutes prior to activation time.
- **Consequences**: Workers are strictly protected from entering a confined space based on stale atmosphere measurements, adhering to statutory compliance requirements expected by factory safety regulators and auditors (such as statutory confined space entry rules and industrial health & safety directorates).
- **Status**: Accepted

---

### D-011 Atomic Human-Readable Permit Number Generation via Sequence
- **Context**: Permit numbers in format `PTW-YYYY-NNNN` must be generated concurrently without race conditions, duplicates, or gaps caused by transaction rollbacks.
- **Options considered**:
  - *Option A*: `SELECT count(*) FROM permits` inside application code (subject to race conditions under concurrent creation).
  - *Option B*: Dedicated PostgreSQL sequence `ptw_permit_no_seq` formatted atomically via `format('PTW-%s-%s', to_char(CURRENT_DATE, 'YYYY'), lpad(nextval('ptw_permit_no_seq')::text, 4, '0'))`.
- **Decision**: Option B — PostgreSQL sequence with formatted string query.
- **Consequences**: Concurrent permit creation never produces colliding permit numbers or lock contention.
- **Status**: Accepted

---

### D-012 Append-Only Audit Trigger Immutability Enforcement & Threat Model
- **Context**: Regulatory authorities demand that safety audit logs cannot be modified through normal application operations, ORM updates, or cascading deletions.
- **Options considered**:
  - *Option A*: Application-level ORM access controls only.
  - *Option B*: PostgreSQL BEFORE UPDATE OR DELETE row-level trigger on `audit_log`, plus statement-level BEFORE TRUNCATE trigger, combined with `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM ptw_app_user`.
- **Decision**: Option B — Multi-layered defense: row-level `audit_log_immutable()` trigger, statement-level `audit_log_truncate_prohibited()` trigger, `ON DELETE RESTRICT` on `audit_log.permit_id`, and explicit privilege revocation for the application role (`ptw_app_user`).
- **Consequences & Threat Model**:
  - *Normal application access*: The application role and standard SQL connections cannot execute `UPDATE`, `DELETE`, or `TRUNCATE` against `audit_log`. Deleting a permit that has audit records is blocked by foreign key restriction (`ON DELETE RESTRICT`).
  - *Honest Threat Model Limitations*: A PostgreSQL superuser (`postgres`) or the table owner has administrative authority to execute `ALTER TABLE audit_log DISABLE TRIGGER ALL;` or alter permissions directly. In a production cloud topology, DBA access must be restricted via separate cloud IAM credentials and external append-only log archiving.
- **Status**: Accepted

---

### D-013 Permit Approvals Model with Generic Role Assignments & Explicit User Overrides
- **Context**: Multi-stage industrial authorization requires sign-offs from both specific individuals (e.g., the designated Area Owner of the permit's Area) and general safety roles (e.g., any certified Safety Officer).
- **Options considered**:
  - *Option A*: Boolean columns on the `permits` table (`is_approved_by_area_owner`, `is_approved_by_safety`).
  - *Option B*: Normalized `permit_approvals` table with `required_role`, nullable `required_user_id`, `status` (`PENDING|APPROVED|REJECTED`), `decided_by`, `decided_at`, `comment`, and `signature_data`.
- **Decision**: Option B — Dedicated `permit_approvals` table.
- **Consequences**: Allows arbitrary multi-tier approval workflows (Area Owner + Safety Officer + optional type-specific specialists) without altering the core `permits` table.
- **Status**: Accepted

---

### D-014 Area Owner Approval Snapshot at Submission vs Dynamic Resolution
- **Context**: When a permit is submitted for approval, an approval requirement for `AREA_OWNER` is generated. A plant area has a designated owner (`areas.owner_id`). If the designated owner of an area changes while a permit is in `PENDING_APPROVAL` status, how should the required user be resolved?
- **Options considered**:
  - *Option A*: Snapshot `required_user_id` as the active `areas.owner_id` at the time of permit submission (`submit` action).
  - *Option B*: Leave `required_user_id` `NULL` and dynamically query `areas.owner_id` whenever an approval is evaluated.
- **Decision**: Option A — Snapshot `required_user_id = areas.owner_id` at submission.
- **Consequences**:
  - *Auditability & Clear Accountability*: The approval record explicitly shows which designated area owner was tasked with authorizing the hazardous work at the moment of request submission.
  - *Consequence of Area Ownership Change*: If plant administration reassigns area ownership while permits are pending approval, existing approval rows preserve the snapshot user ID. An incoming owner or an `ADMIN` must either: (1) sign off under administrative authority, or (2) execute an administrative approval reassignment that updates `permit_approvals.required_user_id` with an explicit `audit_log` entry. The state machine transition guard strictly blocks any other user from approving the row, preventing unauthorized approvals without an audit trail.
- **Status**: Accepted

---

### D-015 Initial Schema Finalization during Pre-Release & Strict Append-Only Migrations from Stage 3
- **Context**: During Stage 2b review (`stage/02b-fixes`), `0000_initial_schema.sql` was amended to include `ON DELETE RESTRICT` on `audit_log.permit_id`, a statement-level truncate trigger, the `ptw_app_user` role, and permit type check constraints. Because this occurred during pre-release development before production deployment, `0000_initial_schema.sql` was updated in-place alongside `0001_permit_type_check.sql` to ensure empty databases initialize with all constraints intact.
- **Options considered**:
  - *Option A*: Continue permitting edits to older migration files as new schema requirements arise.
  - *Option B*: Treat `0000_initial_schema.sql` and `0001_permit_type_check.sql` as the final pre-release baseline. From Stage 3 onwards, all database schema modifications, trigger updates, and constraint additions must strictly be authored as new, forward-only, numbered migrations (e.g. `0002_...sql`).
- **Decision**: Option B — Strict append-only migration policy from Stage 3 onward.
- **Consequences**: Existing databases tracking migrations via `_migrations` table are guaranteed never to experience schema drift or missed migration steps.
- **Status**: Accepted

---

### D-016 Cookie-Only Authentication & Cross-Origin Proxy Deployment Architecture
- **Context**: In an industrial safety system, authentication tokens must be protected from client-side script theft (XSS). Browser storage (`localStorage`/`sessionStorage`) is vulnerable to script exfiltration, whereas `httpOnly` cookies prevent JavaScript access.
- **Options considered**:
  - *Option A*: Dual authentication via `Authorization: Bearer <token>` and cookies.
  - *Option B*: Cookie-only authentication using an `httpOnly`, `SameSite=Lax` cookie, requiring the frontend to proxy `/api` requests on the same origin.
- **Decision**: Option B — Strictly cookie-only authentication with zero Bearer fallback.
- **Deployment & Cross-Origin Topology**:
  - *Primary Deployment Model (Same-Origin Reverse Proxy)*:
    The frontend web tier proxies all `/api/*` requests to the backend service. Because requests are same-origin from the browser's perspective:
    - Cookie is configured with `httpOnly: true`, `SameSite: 'Lax'`, `Path: '/'`, `Secure: process.env.NODE_ENV === 'production'`.
    - No third-party cookie restrictions or browser partitioning issues occur.
    - Example Vercel / Next.js rewrite configuration (`vercel.json` or `next.config.js`):
      ```json
      {
        "rewrites": [
          { "source": "/api/:path*", "destination": "https://api.cmms.local/api/:path*" }
        ]
      }
      ```
    - Example Nginx / Reverse Proxy configuration:
      ```nginx
      location /api/ {
        proxy_pass http://api_backend:4000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
      }
      ```
  - *Fallback Cross-Origin Deployment Model (Separate Domains)*:
    If the frontend and backend are hosted on distinct domains without a reverse proxy (e.g. `app.cmms.com` and `api.cmms.com`):
    - Cookie attributes must be set to `SameSite: 'None'`, `Secure: true`.
    - CORS configuration must set explicit origin (`CORS_ORIGIN=https://app.cmms.com`) and `credentials: true` (wildcard `*` is prohibited with credentials).
    - *CSRF Defense-in-Depth*: Because `SameSite=None` allows cross-site request inclusion, non-GET mutating endpoints (`POST`, `PUT`, `DELETE`) must enforce CSRF mitigations, such as requiring a custom request header (e.g. `X-Requested-With: XMLHttpRequest` or an explicit CSRF token header) which cannot be forged across origins by standard HTML forms without CORS preflight authorization.
- **Consequences**: Complete elimination of client-side token exposure to XSS while maintaining clean same-origin routing.
- **Status**: Accepted

---

### D-017 In-Tree Zero-Dependency Security Headers & Rate Limiting in Restricted Network Environments
- **Context**: In air-gapped, containerized, or sandboxed execution environments, outbound network requests to the public npm registry (`registry.npmjs.org`) may fail (`ECONNRESET`). Third-party packages such as `helmet` and `express-rate-limit` could not be retrieved from the network.
- **Options considered**:
  - *Option A*: Block development or require external internet access to download external packages.
  - *Option B*: Implement zero-dependency, in-tree TypeScript middleware matching the OWASP security header specifications and sliding-window rate limiting.
- **Decision**: Option B — Zero-dependency in-tree implementations in `apps/api/src/middleware/helmet.ts` and `apps/api/src/middleware/rate-limit.ts`.
- **Consequences**: Guarantees reproducible, offline-capable builds for industrial safety environments without relying on third-party supply chain downloads. In future production pipelines with full npm access, swapping to external packages requires only changing the middleware import statements.
- **Status**: Accepted

---

### D-018 Audit Actor Attribution for Automated System Actions & Expirable Status Coverage
- **Context**: Automated lifecycle transitions (such as lazy expiry and background sweeper runs) occur without an interactive human session. Regulatory audit logging requires recording these events without spoofing human authorization. Additionally, the boundary of statuses subject to automated expiry must be strictly defined.
- **Options considered**:
  - *Option A*: Set `audit_log.actor_id = NULL` with system action metadata (`action: 'expire'`, `comment: 'Automated lazy expiry: planned_end window elapsed'`), applying expiry to `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, and `SUSPENDED` (excluding `DRAFT`).
  - *Option B*: Provision a synthetic seeded user (`system@cmms.local`) and include `DRAFT` in automated expiry.
- **Decision**: Option A — Nullable `actor_id` (`NULL`) in `audit_log`, and include `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED` in automated expiry.
- **Consequences**:
  - The database schema explicitly allows `actor_id UUID REFERENCES users(id) ON DELETE SET NULL`. A `NULL` actor unambiguously denotes an automated, non-human system action in compliance audit queries, preventing confusion between automated safety trips and operator interventions.
  - In audit timelines, rows with `actor_id === null` are labeled as `"System"`.
  - `PENDING_APPROVAL` permits whose planned work window has elapsed cannot be approved or activated; they automatically expire to prevent hazardous backdated approvals. `DRAFT` permits are strictly excluded because unsubmitted drafts represent in-progress authoring and do not possess committed operational plant authorizations.
- **Status**: Accepted

---

### D-019 Separation of Duties (Four-Eyes Principle) in Multi-Tier Approvals
- **Context**: In industrial operations, high-hazard permits require multi-tier validation (e.g. Area Owner operational clearance plus Safety Officer risk assessment). If a user holds dual credentials (e.g. an Area Owner who is also an Admin, or a Safety Officer who owns an area), allowing them to satisfy both sign-offs creates a single point of failure.
- **Options considered**:
  - *Option A*: Allow users with matching role permissions to sign any eligible approval tier, regardless of prior sign-offs.
  - *Option B*: Strictly enforce the Four-Eyes Principle: no single user (`actor.id`) can satisfy more than one approval row on the same permit.
- **Decision**: Option B — Separation of duties enforced by approval transition guards.
- **Consequences**: Even if an actor possesses multiple administrative or safety roles, once they have approved one tier on a permit, state machine guards block them from approving any other row on that same permit. Hazardous work always requires at least two distinct human reviews.
- **Status**: Accepted

---

### D-020 Read Visibility Model (Universal Read for Authenticated Users)
- **Context**: In plant safety management, situational awareness across departments is critical. Requesters, contractors, area operators, and safety supervisors need to see active and planned hazardous work in nearby areas to prevent conflicting jobs (e.g. hot work near flammable gas transfers).
- **Options considered**:
  - *Option A*: Strict tenant/department silo where users can only read permits they authored or are assigned to approve.
  - *Option B*: Universal read access for all authenticated plant personnel across all plants, areas, and equipment, while strictly guarding all mutating operations (`submit`, `approve`, `reject`, `activate`, `suspend`, `resume`, `close`, `verify`, `cancel`, `work-logs`, `extensions`) via server-side role and ownership checks.
- **Decision**: Option B — Universal read visibility for authenticated users.
- **Consequences**:
  - Any authenticated user (`requireAuth`) can list and read submitted permits (`PENDING_APPROVAL` onward), view statistics dashboards, and inspect audit event timelines.
  - No user can mutate a permit or perform lifecycle transitions without satisfying strict role barriers, ownership checks, and pure transition guards.
  - Improves operational plant transparency and prevents hazardous spatial blindspots.
- **Status**: Accepted; amended by `D-033` for `DRAFT` permit privacy (`DRAFT` permits remain visible only to their requester and `ADMIN`).

---

### D-021 Modification during PENDING_APPROVAL and In-Flight Approval Reset
- **Context**: When a permit is in `PENDING_APPROVAL`, a requester or admin may need to modify its parameters (e.g. adjust work description, contractor team, or precautions). The question is whether to delete approvals and transition back to `DRAFT`, or retain the status and rows.
- **Options considered**:
  - *Option A*: Delete approvals and transition back to `DRAFT`.
  - *Option B*: Keep status as `PENDING_APPROVAL`, retain all existing approval rows in `permit_approvals`, reset their status to `PENDING` (`decided_by = NULL`, `decided_at = NULL`, `comment = NULL`), and log one audit row per changed field plus one `approvals_reset` audit record documenting invalidated sign-offs.
- **Decision**: Option B — Retain status `PENDING_APPROVAL` (no `PENDING_APPROVAL -> DRAFT` transition exists in the specification), retain approval rows, reset them to `PENDING`, and record field diffs plus an `approvals_reset` audit event.
- **Consequences**: Guarantees that any parameter alteration during review immediately invalidates in-flight approvals and requires re-approval by all tiers without losing the historical structural presence of the required approval tiers. Full audit trail visibility shows exactly which fields were edited and which sign-offs were reset.
- **Status**: Accepted

---

### D-022 Background Expiry Sweeper, Distributed Row-Locking Architecture & Internal Endpoint Security
- **Context**: Industrial safety compliance mandates that overdue permits (`planned_end` in the past) must not remain active. Lazy expiry on read requests (D-018) expires permits when accessed, but unattended permits need automated, background expiration. The architecture must guarantee:
  1. No duplicate expiry transitions or duplicate audit entries under high concurrency across multiple API container instances.
  2. Transaction boundaries must hold candidate row locks (`SELECT ... FOR UPDATE SKIP LOCKED`) until all transitions and audit writes commit.
  3. Batch processing must be atomic per permit using savepoints so failures do not leave permits transitioned without audit records.
  4. Scheduled executions within a single process must not overlap.
  5. The internal sweep endpoint (`POST /internal/sweep`) must be securely authenticated and protected against timing attacks without leaking secrets.
- **Options considered**:
  - *Option A*: In-memory mutex/flag alone, selecting candidate rows and committing immediately, followed by uncoordinated transitions.
  - *Option B*: Distributed PostgreSQL row locking with `SELECT ... FOR UPDATE SKIP LOCKED` held across the entire batch transaction, per-permit savepoints (`SAVEPOINT sp_<id>`), in-process re-entrant protection (`isSweeping`), injectable clock and scheduler abstractions for deterministic testing, and timing-safe secret verification (`crypto.timingSafeEqual`) on `POST /internal/sweep`.
- **Decision**: Option B — Distributed PostgreSQL row locking holding locks throughout the batch, per-permit savepoints, in-process re-entrant guard, and timing-safe header verification.
- **Consequences**:
  - Cross-instance safety: Multiple API instances sweeping concurrently will skip candidate rows currently locked by another instance via `SKIP LOCKED`, executing without blocking or duplicate audit records.
  - Per-permit atomicity: If an individual permit fails during transition or audit insertion, its savepoint rolls back that specific candidate without aborting other candidates or leaving an orphaned state.
  - Response semantics: `POST /internal/sweep` returns `{ scanned: number, expiredCount: number, expiredPermitIds: string[] }`, where `scanned` is the count of rows examined/locked, `expiredCount` is the number of permits successfully expired, and `expiredCount === expiredPermitIds.length`.
  - Security: `SWEEP_SECRET` is enforced to be `>= 32` characters; constant-time comparison prevents timing attacks; secrets are never logged or returned in responses; unauthenticated requests return sanitized 401 responses.
  - Clean lifecycle: `startSweeper()` is idempotent; `stopSweeper()` is safe to call repeatedly and awaits in-flight sweeps before process termination.
- **Status**: Accepted

---

### D-023 Optional Equipment Assignment for General Area Permits
- **Context**: In industrial operations, certain permits (e.g., general area cleaning, surface painting, scaffolding inspection in open storage yards) apply to an entire operational area rather than a specific tag-numbered equipment unit. Requiring equipment on all permits prevented drafting valid area-wide permits.
- **Options considered**:
  - *Option A*: Require dummy or synthetic equipment records for every area.
  - *Option B*: Make `equipmentId` optional and nullable across the database schema, API validators, and frontend forms.
- **Decision**: Option B — Make `equipmentId` optional and nullable.
- **Consequences**:
  - Database column `permits.equipment_id` has `NOT NULL` dropped via migration `0002_permit_equipment_nullable.sql`.
  - Zod schemas allow `equipmentId: z.string().uuid().nullable().optional()`.
  - Location hierarchy validation verifies that IF `equipmentId` is provided, it must exist and belong to the selected `areaId`; if omitted, the permit is successfully associated with the area.
  - Frontend form omits `equipmentId` when unselected and displays "No equipment in this area (optional)" when an area contains zero equipment.
- **Status**: Accepted

---

### D-024 Client Error Boundary & React Render Resilience
- **Context**: Unexpected client-side rendering exceptions (such as attempting to render object shapes or missing nested properties) previously caused the root React component tree to crash and unmount, leaving users with a blank white screen.
- **Options considered**:
  - *Option A*: Rely solely on defensive coding in individual child components without error boundaries.
  - *Option B*: Implement a top-level React `ErrorBoundary` wrapping the router tree, combined with safe rendering helpers for polymorphic audit data.
- **Decision**: Option B — Implement `ErrorBoundary` at `<App />` root with friendly recovery UI and dev-only diagnostic details.
- **Consequences**:
  - Unhandled child rendering exceptions are trapped gracefully; the user is presented with industrial recovery actions ("Back to permits" and reload options) without unmounting the navigation shell.
  - Technical diagnostic information is restricted to non-production environments to avoid exposing system details.
- **Status**: Accepted

---

### D-025 Equipment Assignment: Optional for Draft, Mandatory on Submission
- **Context**: Industrial Permit to Work forms need flexibility during initial drafting (e.g. scoping work in an area before specific tag numbers are confirmed). However, once formal authorization is requested, safety regulations require specific equipment to be identified for physical isolation (LOTO, hot work boundary, confined space vessel ID).
- **Options considered**:
  - *Option A*: Require equipment at draft creation. (Rejected: Prevents drafting work in advance or for general area tasks).
  - *Option B*: Keep equipment optional everywhere including submission. (Rejected: Fails regulatory requirements for specific equipment isolation).
  - *Option C*: Allow equipment to be optional and nullable during `DRAFT`, but enforce equipment presence and area consistency upon `submit` transition.
- **Decision**: Option C — Permit creation and draft updates allow `equipmentId: null`. The `submit` lifecycle transition enforces `guardSubmitEquipment`, rejecting submission with HTTP 422 `VALIDATION_ERROR` (`"Select equipment from the chosen area"`) if `equipmentId` is missing or mismatched.
- **Consequences**:
  - Requesters can save incomplete drafts without equipment.
  - Permits cannot transition to `PENDING_APPROVAL` without a specific equipment assignment.
  - Location hierarchy validation ensures assigned equipment belongs strictly to the permit's designated plant area.
- **Status**: Accepted

---

### D-026 Database Migrations Execution Decoupled from Application Server Startup
- **Context**: Automated execution of database migrations (`runMigrations()`) inside `startServer()` creates two major architectural risks in production:
  1. The runtime application should run with least privilege using a restricted role (`ptw_app_user`), which lacks DDL permissions (`CREATE TABLE`, `ALTER TABLE`, `DROP CONSTRAINT`). Providing DDL credentials to runtime app instances violates security isolation.
  2. In horizontally scaled or serverless deployments, concurrent container startups create race conditions during schema alteration unless complex distributed advisory locking (`pg_advisory_lock`) is implemented.
- **Options considered**:
  - *Option A (Chosen for Production)*: Remove `runMigrations()` from `server.ts` runtime startup. Execute migrations as an explicit pre-deployment command (`npm run db:migrate` with `ADMIN_DATABASE_URL`), such as Render `preDeployCommand`, Docker release phase, or CI/CD deploy pipeline.
  - *Option B*: Retain `runMigrations()` in `server.ts` using `ADMIN_DATABASE_URL` and `pg_advisory_lock(hash('ptw_migrations'))`. (Rejected: Forces runtime API containers to possess administrative DDL credentials).
- **Decision**: Option A — Decouple migration execution from runtime server startup. In production and local development, migrations are run explicitly via `npm run db:migrate` using administrative database credentials.
- **Consequences**:
  - The runtime API server runs securely under least privilege without needing administrative DDL capabilities.
  - Container startups are fast and deterministic, eliminating advisory lock timeouts and startup race conditions across multi-instance clusters.
  - Documented explicitly in `README.md` and automated deployment scripts.
- **Status**: Accepted

---

### D-027 Idempotent Natural-Key Database Seeding and Reference Data Unique Constraints
- **Context**: The development and test database seed scripts were inserting duplicate plant and area records on repeated executions. The `plants` table previously lacked natural keys (`code`) and physical facility addresses, and `areas` lacked a `code` column and a composite unique constraint on `(plant_id, code)`. Because `id` defaults to `gen_random_uuid()`, `ON CONFLICT DO NOTHING` without explicit conflict targets never matched existing records, causing unbounded duplicates upon re-seeding and rendering plant codes, area codes, and facility addresses blank in the frontend reference data tables and permit creation dropdowns.
- **Options considered**:
  - *Option A*: Edit old migration `0000_initial_schema.sql` to add constraints retroactively. (Rejected: Violates immutable migration discipline and breaks existing production environments).
  - *Option B*: Perform application-level deduplication by name before inserting. (Rejected: Vulnerable to race conditions without database-level unique constraints and fails to provide unique natural codes).
  - *Option C*: Add a new migration `0003_plants_areas_codes_and_constraints.sql` establishing `plants.code UNIQUE`, `plants.address`, `areas.code`, and `UNIQUE (plant_id, code)`, and rewrite `seedDatabase()` to use explicit natural-key upserts (`ON CONFLICT (code) DO UPDATE`, `ON CONFLICT (plant_id, code) DO UPDATE`, `ON CONFLICT (tag) DO UPDATE`, `ON CONFLICT (email) DO UPDATE`).
- **Decision**: Option C — Implement migration 0003, update Drizzle schema definitions, update reference API routes to return `code` and `address`, and make `seedDatabase()` fully idempotent across users, plants, areas, equipment, and permits with realistic reference data (3 plants, 8 areas with assigned area owners, 26 equipment, 5 users).
- **Consequences**:
  - Re-running `seedDatabase()` any number of times results in strictly identical row counts (verified by unit test `executes the seed script twice without error (idempotent verification): counts unchanged`).
  - Plants, areas, and equipment display distinct codes, tags, and addresses in both `ReferenceDataPage.tsx` and `CreatePermitPage.tsx`.
  - Cascading location dropdowns in the permit creation wizard list each plant, area, and equipment item exactly once.
- **Status**: Accepted

---

### D-028 Pending Area Approval Reassignment on Area Owner Change (Amends D-014)
- **Context**: Under `D-014`, `permit_approvals.required_user_id` snapshots `areas.owner_id` at permit submission. When an administrator changes an area's designated owner (`PATCH /api/admin/areas/:id`) or transfers area ownership to another `AREA_OWNER`, previously snapshotted `PENDING` approval rows on open permits in that area would otherwise remain assigned to the outgoing owner — blocking handover or stranding permits if the outgoing owner is demoted or deactivated.
- **Options considered**:
  - *Option A*: Keep old `required_user_id` frozen forever unless modified by a separate ad-hoc reassignment call (previous `D-014` behavior).
  - *Option B*: Atomically update `required_user_id` on all `PENDING` `AREA_OWNER` approval rows of non-terminal permits (`status NOT IN ('CLOSED_VERIFIED', 'CANCELLED', 'REJECTED', 'EXPIRED')`) in that area to the new owner in the same transaction as the area owner update, and write an `audit_log` row (`action = 'approver_reassigned'`, `actor_id = admin.id`) on each affected permit while leaving decided (`APPROVED`/`REJECTED`) rows untouched. Allow areas to move freely between active `AREA_OWNER` users (`REASSIGN_AREAS_FIRST` applies only when demoting or deactivating an `AREA_OWNER` who still owns areas, with no rule forcing `AREA_OWNER` users to hold >= 1 area; `areas.owner_id` must always belong to an active `AREA_OWNER`).
- **Decision**: Option B — Transactional pending approval reassignment with permit audit entries and explicit `REASSIGN_AREAS_FIRST` barrier on owner demotion/deactivation. (Amends `D-014`.)
- **Consequences**:
  - Open permits never strand with an inactive or outgoing Area Owner.
  - Historical `APPROVED`/`REJECTED` sign-offs keep their immutable record of who actually signed off.
  - `audit_log` records every approver reassignment attributed to the executing administrator.
- **Status**: Accepted (supersedes the static freeze clause in `D-014`)

---

### D-029 Soft Deactivation (`is_active`), Child/Permit Guards & Active Location Scoping
- **Context**: Hard-deleting users, plants, areas, or equipment breaks `ON DELETE RESTRICT` foreign keys on permits, approvals, work logs, and audit trails. At the same time, inactive entities must be unusable for new logins, new approvals, or new permits, and deactivating parent entities must not silently cascade.
- **Options considered**:
  - *Option A*: Cascade deactivation down from plants to areas and equipment, and permit deactivation with open permits. (Rejected: silently breaks in-flight permits and hides child state transitions.)
  - *Option B*: Soft-deactivate (`is_active = false`) via migration `0004`, reject deactivation when non-terminal permits reference the target (`409 HAS_OPEN_PERMITS`) or when active children exist (`409 HAS_ACTIVE_CHILDREN`), verify `is_active = true` on every authenticated request (`requireAuth`) and login (`401`), filter public reference endpoints to active items (with active parents) while providing admin-only `?includeInactive=true` for permit filtering, and reject inactive locations in `validateLocationConsistency()` (`422`).
- **Decision**: Option B — Non-cascading soft deactivation with explicit conflict guards and real-time auth enforcement.
- **Consequences**:
  - Existing sessions for deactivated users fail with `401` on their next API call.
  - Historical permits retain full relational joins to deactivated plants, areas, and equipment, and admins can filter by them using `?includeInactive=true`.
- **Status**: Accepted

---

### D-030 Append-Only Admin Audit Log (`admin_audit_log`) & Secret Scrubbing
- **Context**: Administrative lifecycle mutations (creating users, changing roles, deactivating/reactivating entities, resetting passwords) are not scoped to a single `permit_id`, so they cannot live in `audit_log`. Yet safety governance demands an immutable log of administrative actions matching `D-012`.
- **Options considered**:
  - *Option A*: Relax `audit_log.permit_id` constraints and mix system administration rows into permit timelines. (Rejected: pollutes per-permit safety timelines and weakens `permit_id` semantics.)
  - *Option B*: Create dedicated `admin_audit_log` (`actor_id`, `entity_type`, `entity_id`, `action`, `from_value JSONB`, `to_value JSONB`, `created_at`) in migration `0004` with `BEFORE UPDATE OR DELETE` row trigger, `BEFORE TRUNCATE` statement trigger, and `REVOKE UPDATE, DELETE, TRUNCATE ... FROM ptw_app_user`. Strictly scrub passwords and hashes so credentials are never written.
- **Decision**: Option B — Separate append-only `admin_audit_log` table executing writes inside the same database transaction as every admin mutation.
- **Consequences**:
  - Same tamper-evidence guarantees (and superuser threat model documented in `D-012`) apply to administrative changes, viewable chronologically via `GET /api/admin/activity`.
- **Status**: Accepted

---

### D-031 Strict Permit Ownership (`submit`, `activate`, `close`) & Independent Closure Verification
- **Context**: `guardRequesterOwnership` previously checked `ctx.actor.role === UserRole.REQUESTER && ctx.actor.id !== ctx.permit.requesterId`, which unintentionally permitted any `SAFETY_OFFICER` to submit, activate, or close another user's permit. Conversely, granting `ADMIN` full override access to close a requester's permit allowed that same `ADMIN` to immediately verify their own closure because `guardNoSelfAction` only checked `actor.id === permit.requesterId`.
- **Options considered**:
  - *Option A*: Leave `SAFETY_OFFICER` able to activate/close others' permits and only check `requesterId` during `verify`. (Rejected: violates permit-holder accountability and allows single-actor close+verify bypass by `ADMIN`.)
  - *Option B*: Enforce `actor.role !== UserRole.ADMIN && actor.id !== permit.requesterId -> 403 NOT_PERMIT_OWNER` across `submit`, `activate`, `close`, and `cancel`, while retaining `SAFETY_OFFICER` authority on safety actions (`approve`, `reject`, `suspend`, `resume`, `verify`) and permits the officer personally created. Add `guardClosureVerifySeparation` querying the latest `audit_log` `'close'` actor for `CLOSED` permits so nobody (including `ADMIN`) can `verify` a permit they themselves closed (`403 DUTIES_SEPARATION_VIOLATION`, and `'verify'` omitted from `allowedActions`).
- **Decision**: Option B — Owner-or-Admin execution for holder lifecycle steps and strict closer/verifier separation of duties.
- **Consequences**:
  - Permit holders remain strictly accountable for job readiness (`submit`, `activate`) and field completion (`close`), with `ADMIN` escape-hatch preserved.
  - Even when an `ADMIN` closes a permit in an emergency, an independent `SAFETY_OFFICER` or second `ADMIN` must sign off `CLOSED_VERIFIED`.
- **Status**: Accepted

---

### D-032 Shared Submit-Time Atmospheric Gas Safety Thresholds (`UNSAFE_ATMOSPHERE`)
- **Context**: `DynamicFields.tsx` rendered client-side threshold alerts (`LEL > 10%`, `O2 < 19.5% || > 23.5%`, `H2S > 10 ppm`, `CO > 35 ppm`), and `Number(null) < 19.5` triggered false O2 alerts on empty fields, while the backend API allowed unsafe atmospheric readings to pass submission.
- **Options considered**:
  - *Option A*: Enforce thresholds inside draft creation/update (`POST`/`PATCH`) as well as submit. (Rejected: prevents operators from saving incomplete or intermediate draft calibrations while troubleshooting equipment.)
  - *Option B*: Export a single `GAS_SAFETY_THRESHOLDS` constant and `evaluateGasThresholds()` helper from `@ptw/shared`, read it from `DynamicFields.tsx` (guarding `null`/empty inputs), and enforce it exclusively in `validatePermitDetails(..., 'submit')` rules for `HOT_WORK` (`gas_test`) and `CONFINED_SPACE` (`atmosphere_test`), mapping failures in `guardSubmitDetails` / `transition-engine.ts` to HTTP `422 UNSAFE_ATMOSPHERE` with structured `details.offendingReadings`.
- **Decision**: Option B — Single shared threshold source enforced strictly at submission while keeping drafts permissive.
- **Consequences**:
  - UI warnings and API enforcement cannot drift out of sync.
  - Thresholds are currently shared across facilities; per-plant industrial hygiene tolerances would move into database configuration if multi-site policies diverge.
- **Status**: Accepted

---

### D-033 DRAFT Permit Visibility Restricted to Requester Owner & ADMIN (Amends D-020)
- **Context**: Under `D-020`, universal read visibility allowed `AREA_OWNER`, `SAFETY_OFFICER`, and other `REQUESTER` users to view unsubmitted `DRAFT` permits in lists, searches, statistics counts, detail pages, and audit timelines—leaking unfinished work-in-progress permits before submission and returning `403` instead of hiding draft existence.
- **Options considered**:
  - *Option A*: Filter `DRAFT` rows ad hoc per route handler and return `403 FORBIDDEN` on direct `GET /api/permits/:id` hits. (Rejected: duplicates visibility logic across routes and reveals draft existence via `403`.)
  - *Option B*: Centralize one canonical predicate helper (`canViewPermit`, `assertPermitVisible`, `buildPermitVisibilitySql` in `permit-visibility.ts`) enforcing that `DRAFT` permits are visible strictly to `permit.requesterId === actor.id` or `actor.role === 'ADMIN'`, while preserving universal authenticated visibility from `PENDING_APPROVAL` onward. Non-owners/non-admins receive HTTP `404 NOT_FOUND` on direct reads (`GET /:id`, `/audit`, `work-logs`) and mutations (`PATCH`, `/submit`, etc.) and zero inclusion in lists, search, pagination totals, or dashboard stats.
- **Decision**: Option B — Single-source-of-truth draft privacy predicate with `404` non-disclosure, amending `D-020`.
- **Consequences**:
  - Unsubmitted drafts (`PTW-2026-0007` and newly saved drafts) remain private to the author and `ADMIN` across all API read/write surfaces.
  - Upon `submit` (`PENDING_APPROVAL`), permits immediately become visible to all authenticated facility personnel as intended by `D-020`.
- **Status**: Accepted (amends `D-020`)








