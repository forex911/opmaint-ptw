# Architecture Decision Records (ADRs) - CMMS Permit to Work (PTW)

This document records the architectural and design decisions for the industrial Permit to Work (PTW) backend module. Every decision must be defensible in code review and regulatory audits.

---

## ADR-001: Monorepo Structure and Workspace Manager

- **Status**: Accepted
- **Context**: The application requires shared type definitions, enums, and a dynamic permit type registry shared between the backend API and future frontends/clients.
- **Decision**: Use npm workspaces with two primary directories: `packages/shared` (`@ptw/shared`) and `apps/api` (`@ptw/api`). Node 20+ with native ESM (`"type": "module"`) and strict TypeScript throughout.
- **Justification**: npm workspaces provide native monorepo linking without external package manager dependencies (e.g., pnpm, yarn), ensuring seamless reproducibility across standard developer machines and container builds.

---

## ADR-002: Dynamic Permit Type Registry and Zod Schema Generator

- **Status**: Accepted
- **Context**: The plant must authorize different hazard categories (Hot Work, Confined Space, Working at Height, Electrical LOTO) with disparate field sets, while remaining extensible for future types (e.g., Excavation) without database migrations or endpoint changes.
- **Decision**: Define a declarative permit type registry in `/packages/shared` where each permit type specifies a metadata schema (`FieldDefinition[]`) and optional domain rules (`PermitTypeRule[]`). The backend dynamically compiles this registry into Zod schemas for two distinct validation modes:
  1. `draft`: Permissive schema allowing partial input while drafting.
  2. `submit`: Strict schema requiring all mandatory fields, range boundaries (`min`/`max`), non-empty lists, and nested reading verifications.
- **Justification**: Satisfies the core architectural requirement that registering a new permit type requires only a config object entry, without adding tables, duplicating routes, or copying validation code.

---

## ADR-003: Password Hashing Library Selection (`bcryptjs`)

- **Status**: Accepted
- **Context**: User credentials must be hashed securely. The spec allows either argon2 or bcrypt.
- **Decision**: Use `bcryptjs` with standard 10 salt rounds.
- **Justification**: `bcryptjs` produces standard bcrypt hashes without requiring host C++ compilers (`node-gyp` / Visual Studio Build Tools), which frequently fail during installation in Windows execution sandboxes and cross-platform container builds.

---

## ADR-004: Strict Error Response Envelope and Machine-Readable Error Codes

- **Status**: Accepted
- **Context**: Industrial CMMS systems require deterministic error handling across UI and automated integrations. The spec requires one central error middleware and consistent response shapes.
- **Decision**: All non-2xx responses strictly adhere to:
  ```json
  {
    "error": {
      "code": "STRING_ERROR_CODE",
      "message": "Human readable explanation",
      "details": {}
    }
  }
  ```
  Standard error codes:
  - `401`: `UNAUTHENTICATED`
  - `403`: `FORBIDDEN` (with specific sub-codes: `FORBIDDEN_SELF_APPROVAL`, `FORBIDDEN_AREA_MISMATCH`, `FORBIDDEN_ROLE_MISMATCH`, `FORBIDDEN_NOT_OWNER`)
  - `404`: `NOT_FOUND`
  - `409`: `ILLEGAL_TRANSITION` (details include `from`, `action`, `allowedActions`)
  - `422`: `VALIDATION_ERROR` (details include field paths and issues)
- **Justification**: Prevents ad-hoc error structures and guarantees that guards and transitions communicate explicit failure reasons to clients.

---

## ADR-005: State Machine Enforcement via Single Database Transaction

- **Status**: Accepted
- **Context**: Real-world PTW failure modes involve unrecorded authorizations, self-approvals, or conflicting state updates under concurrent requests.
- **Decision**: All state changes must pass through a single declarative entrypoint `transition(permitId, action, actor, payload)`. It acquires a row-level lock via `SELECT ... FOR UPDATE`, runs lazy expiry, evaluates pure guard functions, updates status, and inserts an audit log entry within the same database transaction. Direct writes to permit status are prohibited.
- **Justification**: Eliminates race conditions such as duplicate approvals or concurrent activation after permit expiry.

---

## ADR-006: Immutable Append-Only Audit Log via Database Triggers

- **Status**: Accepted
- **Context**: In safety investigations, the plant must have tamper-proof records of who authorized what. Application-level checks alone are insufficient if direct DB access occurs.
- **Decision**: Enforce append-only semantics on the `audit_log` table via a PostgreSQL database trigger (`BEFORE UPDATE OR DELETE ON audit_log RAISE EXCEPTION`).
- **Justification**: Guarantees audit trail immutability at the database engine level, preventing accidental or malicious modification of historical safety records.

---

## ADR-007: Dual Expiry Mechanism (Lazy Expiry + Sweeper Webhook)

- **Status**: Accepted
- **Context**: Permits must expire automatically when `now > planned_end`. Free or serverless hosting environments may sleep background cron threads.
- **Decision**: Implement a two-tier expiry strategy:
  1. *Lazy Expiry*: Every read and state transition inspects `planned_end`. If overdue, it transitions the permit to `EXPIRED` with `actor = SYSTEM` and writes an audit row.
  2. *Active Sweeper*: An in-process `node-cron` runs every minute, supplemented by a protected webhook `POST /internal/sweep` requiring header `X-Sweep-Secret` for external monitoring cron services.
- **Justification**: Guarantees that no expired permit can ever be activated or closed even if the cron sweeper is paused or lagging.

---

## ADR-008: Permit Human-Readable Identification Format

- **Status**: Accepted
- **Context**: Industrial operators reference permits by readable tags on physical boards and radios rather than raw UUIDs.
- **Decision**: Use `PTW-YYYY-NNNN` (e.g., `PTW-2026-0001`), where `YYYY` is the current calendar year and `NNNN` is a zero-padded sequential counter.
- **Justification**: Complies with standard plant safety tagging practices and provides unambiguous verbal communication during hazardous work coordination.

---

## ADR-009: Gas Test Timing Rules for Confined Space Entry

- **Status**: Accepted
- **Context**: Confined spaces accumulate dangerous gases (H2S, CO, methane) or deplete oxygen rapidly.
- **Decision**: For `CONFINED_SPACE` permits, enforce a domain rule at submission: `atmosphere_test.tested_at` must be recorded within 60 minutes prior to `planned_start`. Tests older than 60 minutes fail submission validation with error code `ATMOSPHERE_TEST_STALE`.
- **Justification**: Prevents entering confined spaces based on historical atmospheric data that no longer reflects real-time conditions.
