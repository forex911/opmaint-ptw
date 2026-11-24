# CMMS Permit to Work (PTW) Module

A high-integrity, server-authoritative backend module for Permit to Work (PTW) industrial safety management within a Computerized Maintenance Management System (CMMS).

---

## 1. Overview & Scope

In industrial facilities (oil & gas, chemical processing, heavy manufacturing), maintenance jobs involving open flame (Hot Work), confined spaces, high elevation, or high voltage (Electrical LOTO) carry life-threatening risks. A Permit to Work (PTW) authorises hazardous tasks before work begins.

This module guarantees server-side authorization enforcement, complete audit trails, and strict lifecycle transitions.

> **Project Scope Notice**: This repository focuses strictly on the backend API service (`apps/api`), database schema, business rules, and shared domain models (`packages/shared`). The `apps/web` directory is a reserved stub placeholder for the frontend team; all UI and client application work is governed by a separate frontend work order.

---

## 2. Quickstart & Clean Installation

### Prerequisites
- Node.js `v20.14+` or `v24+`
- npm `v10+`
- PostgreSQL `v15+` (for Stage 2 onwards; local Docker setup provided below)

### Setup Steps
```bash
# 1. Clone the repository
git clone <repo-url>
cd task

# 2. Install workspace dependencies
npm ci

# 3. Run typecheck and lint
npm run typecheck
npm run lint

# 4. Build all workspace packages
npm run build

# 5. Run test suite
npm run test
```

### Git Hooks & Sandbox Execution Note
Git hooks for pre-commit (`typecheck` + `lint`) and pre-push (`test`) are automatically installed into `.git/hooks/` during `npm ci` / `npm run prepare`. On Windows execution environments where msys `sh.exe` encounters local sandbox restrictions, all verification commands (`npm run typecheck`, `npm run lint`, `npm test`) are executed explicitly prior to committing.

### Remote Push Commands
When a remote repository is configured, push branches and tags using:
```bash
git push origin main --tags
git push origin stage/01-skeleton
git push origin stage/01b-cleanup
```
*(If no remote exists, operations remain safely recorded in local git history).*

---

## 3. Demo Credentials (Preview for Stage 2 Seed)

| Role | Email | Password | Responsibility |
|---|---|---|---|
| `REQUESTER` | `requester@cmms.local` | `PtwPass2026!` | Drafts permits, coordinates contractor teams, closes work |
| `AREA_OWNER` | `area.owner@cmms.local` | `PtwPass2026!` | Authorizes permits located in their assigned plant area |
| `SAFETY_OFFICER` | `safety.officer@cmms.local` | `PtwPass2026!` | Plant-wide safety review, suspensions, closures, verification |
| `ADMIN` | `admin@cmms.local` | `PtwPass2026!` | Plant/area/equipment configuration, emergency overrides |

---

## 4. Key Architectural Decisions Summary

- **D-001 (Monorepo)**: npm workspaces (`packages/shared`, `apps/api`) with native Node ESM.
- **D-002 (Password Hashing)**: `bcryptjs` with 10 salt rounds for deterministic Windows/Docker builds.
- **D-003 (Dynamic Registry)**: Permit details stored as JSONB with dynamic Zod schemas compiled from a shared registry; adding a 5th type (e.g. Excavation) requires zero database or route changes.
- **D-004 (Confined Space Gas Rule at Submit)**: Pre-entry atmospheric tests must be recorded within 60 minutes prior to planned start.
- **D-005 (Error Envelope)**: Unified error response format `{ error: { code, message, details } }`.
- **D-006 (State Machine)**: Single `transition()` function with `SELECT ... FOR UPDATE` row locks.
- **D-007 (Audit Log Trigger)**: PostgreSQL database trigger preventing `UPDATE` and `DELETE` on `audit_log`.
- **D-008 (Dual Expiry)**: Lazy expiry on every read/write backed by a minute-interval sweeper and webhook.
- **D-009 (Permit Numbering)**: Human-readable identifier format `PTW-YYYY-NNNN`.
- **D-010 (Confined Space Gas Re-Verification at Activation)**: Atmospheric testing timestamp is verified at activation to ensure freshness (`now - tested_at <= 60 minutes`).

---

## 5. Known Limitations & Deferred Scope

See [docs/KNOWN_ISSUES.md](file:///D:/task/docs/KNOWN_ISSUES.md) for detailed descriptions.
- Database schema, Drizzle ORM migrations, and seed scripts are implemented in **Stage 2**.
- Authentication, role middleware, and session cookies are implemented in **Stage 3**.
- State machine transition engine is implemented in **Stage 4**.
- Permit CRUD, stats, work logs, and audit endpoints are implemented in **Stage 5**.
- Expiry sweeper is implemented in **Stage 6**.
- Extension requests and overlapping conflict detection are implemented in **Stage 7**.

---

## 6. AI Usage Transparency

See [docs/AI_USAGE.md](file:///D:/task/docs/AI_USAGE.md) for the full log of AI prompts, generated code, human reviews, and corrected build errors.
