# Known Issues and Deferred Scope

This document tracks known limitations, intentional design trade-offs, and features deferred to later stages.

---

## Active & Deferred Scope

### 1. Frontend Web Application (`apps/web`) Out of Scope
- **Description**: `apps/web` contains only a stub `package.json`. The user work order explicitly specifies that the frontend is out of scope for the current backend task and will be addressed in a separate frontend master prompt.
- **Severity**: None (explicitly out of scope).
- **Status**: Reserved for frontend implementation.

### 2. State Machine Transitions & Guards (Completed in Stage 4)
- **Description**: Central permit state machine with `SELECT ... FOR UPDATE` concurrency row locking, pure unit-testable guards, persistent lazy expiry, and Four-Eyes separation of duties (`D-019`) completed and verified with 105 tests in Stage 4 and Stage 4b.
- **Status**: Implemented & verified.

### 3. HTTP Endpoints & Auth Middleware
- **Description**: Route handlers, session cookies, and auth middleware implemented in Stage 3. Permit CRUD, list filters, stats, and audit timeline scheduled for Stage 5. Sweeper jobs, extensions, and conflict detection scheduled for Stages 6 and 7.
- **Status**: Stage 3 (Auth complete), Stage 4 (State machine complete), Stage 5 (Permits in progress).

### 4. Stateless JWT Logout without Distributed Blocklist
- **Description**: Calling `POST /api/auth/logout` clears the client's `httpOnly` session cookie. However, because JWT verification is stateless, an unexpired token if exfiltrated prior to logout remains cryptographically valid until its 8-hour window expires (or until the user is deactivated in the database).
- **Severity**: Low / Standard stateless JWT behavior.
- **Mitigation & Future Scope**: The JWT carries only user ID and `requireAuth` queries the active database user on every request, ensuring deleted/deactivated users are immediately rejected. A token denylist (e.g. in Redis) or rotating refresh tokens can be introduced if instant revocation is required.

### 5. Package Installation & CI Verification
- **Description**: `helmet` (v8.3.0) and `express-rate-limit` (v8.7.5) are installed in `apps/api/package.json` and active in `helmet.ts` and `rate-limit.ts`. In restricted network environments or local air-gapped sandboxes where npm registry downloads are firewalled, GitHub Actions CI runs with full npm registry access (`npm ci`) to build and verify the packages.
- **Severity**: None / Resolved.
- **Status**: Packages installed and verified; CI workflow tests against real PostgreSQL.


