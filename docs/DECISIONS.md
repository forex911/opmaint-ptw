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

### D-018 Audit Actor Attribution for Automated System Actions (Expire Sweeper)
- **Context**: Automated lifecycle transitions (such as lazy expiry and background sweeper runs) occur without an interactive human session. Regulatory audit logging requires recording these events without spoofing human authorization.
- **Options considered**:
  - *Option A*: Set `audit_log.actor_id = NULL` with system action metadata (`action: 'EXPIRE'`, `comment: 'Automated expiry: planned_end window elapsed'`).
  - *Option B*: Provision a synthetic seeded user (`system@cmms.local`).
- **Decision**: Option A — Nullable `actor_id` (`NULL`) in `audit_log`.
- **Consequences**: The database schema explicitly allows `actor_id UUID REFERENCES users(id) ON DELETE SET NULL`. A `NULL` actor unambiguously denotes an automated, non-human system action in compliance audit queries, preventing confusion between automated safety trips and operator interventions.
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




