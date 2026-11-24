# Known Issues and Deferred Scope

This document tracks known limitations, intentional design trade-offs, and features deferred to later stages.

---

## Active & Deferred Scope

### 1. Frontend Web Application (`apps/web`) Out of Scope
- **Description**: `apps/web` contains only a stub `package.json`. The user work order explicitly specifies that the frontend is out of scope for the current backend task and will be addressed in a separate frontend master prompt.
- **Severity**: None (explicitly out of scope).
- **Status**: Reserved for frontend implementation.

### 2. State Machine Transitions & Guards Deferred to Stage 4
- **Description**: While the database schema and CHECK constraints enforce status enum validity, the declarative transition matrix, role guards, and `SELECT ... FOR UPDATE` concurrency service are scheduled for implementation in **Stage 4**.
- **Severity**: Low (by design per stage work order).
- **Status**: Scheduled for Stage 4.

### 3. HTTP Endpoints & Auth Middleware Deferred to Stages 3, 5, 6, 7
- **Description**: Route handlers, session cookies, permit CRUD, stats, lazy expiry middleware, sweeper jobs, extensions, and conflict detection will be wired in upcoming stages.
- **Severity**: Low (by design per stage work order).
- **Status**: Stage 3 (Auth/middleware), Stage 5 (Permits), Stage 6 (Expiry), Stage 7 (Extensions/Conflicts).

### 4. Stateless JWT Logout without Distributed Blocklist
- **Description**: Calling `POST /api/auth/logout` clears the client's `httpOnly` session cookie. However, because JWT verification is stateless, an unexpired token if exfiltrated prior to logout remains cryptographically valid until its 8-hour window expires (or until the user is deactivated in the database).
- **Severity**: Low / Standard stateless JWT behavior.
- **Mitigation & Future Scope**: The JWT carries only user ID and `requireAuth` queries the active database user on every request, ensuring deleted/deactivated users are immediately rejected. A token denylist (e.g. in Redis) or rotating refresh tokens can be introduced if instant revocation is required.

### 5. Sandboxed Offline Environment & In-Tree Security Middleware
- **Description**: In the current execution sandbox, outbound TCP connections to `registry.npmjs.org` are blocked (`ECONNRESET`). Consequently, new runtime dependencies cannot be downloaded via `npm install`.
- **Severity**: None / Architectural design choice.
- **Resolution**: Implemented zero-dependency in-tree middleware for OWASP security headers (`apps/api/src/middleware/helmet.ts`) and IP-based sliding window rate limiting (`apps/api/src/middleware/rate-limit.ts`) per Decision `D-017`.


