# Known Issues and Deferred Scope

This document tracks known limitations, intentional design trade-offs, and features deferred to later stages.

---

## Stage 1 & 1b Known Issues & Deferred Scope

### 1. Frontend Web Application (`apps/web`) Out of Scope
- **Description**: `apps/web` contains only a stub `package.json`. The user work order explicitly specifies that the frontend is out of scope for the current backend task and will be addressed in a separate frontend master prompt.
- **Severity**: None (explicitly out of scope).
- **Status**: Reserved for frontend implementation.

### 2. Database Connection and Schema Deferred to Stage 2
- **Description**: The database connection pool (`pg`), Drizzle tables (`users`, `plants`, `areas`, `equipment`, `permits`, `permit_precautions`, `permit_approvals`, `permit_work_logs`, `permit_extensions`, `audit_log`), and DB triggers are scheduled for Stage 2.
- **Severity**: Low (by design per stage work order).
- **Status**: Scheduled for implementation in Stage 2.

### 3. Express Server and HTTP Routes Deferred to Stages 3, 5, 6, 7
- **Description**: The API route handlers, authentication cookies, state machine transitions, permit CRUD endpoints, work logs, extensions, and conflict detection endpoints are not yet wired up.
- **Severity**: Low (by design per stage work order).
- **Status**: Stage 3 (Auth/middleware), Stage 4 (State machine), Stage 5 (Permit endpoints), Stage 6 (Expiry), Stage 7 (Extensions/Conflicts).
