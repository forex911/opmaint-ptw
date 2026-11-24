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
- **Consequences**: Workers are strictly protected from entering a confined space based on stale atmosphere measurements, adhering to OSHA 1910.146 and UK HSE confined space entry standards.
- **Status**: Accepted
