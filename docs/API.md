# API Specification - CMMS Permit to Work (PTW)

All API endpoints are prefixed with `/api`. All error responses conform to the standard error shape defined in `D-005`.

---

## Error Response Shape

```json
{
  "error": {
    "code": "STRING_ERROR_CODE",
    "message": "Human-readable description of error",
    "details": {}
  }
}
```

### Standard Error Codes
- `401 UNAUTHENTICATED`: Session missing or expired.
- `403 FORBIDDEN`: Insufficient role or forbidden action.
  - `FORBIDDEN_SELF_APPROVAL`: Actor cannot approve/verify their own permit.
  - `FORBIDDEN_AREA_MISMATCH`: Area Owner can only approve permits for their assigned area.
  - `FORBIDDEN_ROLE_MISMATCH`: User does not hold the required role.
  - `FORBIDDEN_NOT_OWNER`: Action restricted to the permit owner.
- `404 NOT_FOUND`: Resource does not exist.
- `409 ILLEGAL_TRANSITION`: State transition not permitted in current state. Details include `{ from, action, allowedActions }`.
- `409 EARLY_ACTIVATION`: Cannot activate permit before `planned_start`.
- `409 STALE_GAS_TEST`: For `CONFINED_SPACE` permits, atmospheric gas test must be verified within 60 minutes of activation (D-010).
- `409 PENDING_APPROVALS`: All approval tiers must be `APPROVED` before activation.
- `409 DUTIES_SEPARATION_VIOLATION`: Same individual cannot sign off multiple approval tiers on the same permit (D-019).
- `422 VALIDATION_ERROR`: Zod validation failure. Details include `{ path, message, code }[]`.
- `422 MISSING_COMPLETION_NOTES`: Mandatory completion notes required when closing a permit (D-005).
- `422 MISSING_COMMENT`: Mandatory comment required for `reject`, `suspend`, and `cancel` (D-005).

---

## Endpoints Table (Target Specification)

| Method | Path | Required Role / Guard | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticate user, set `httpOnly` JWT cookie |
| `POST` | `/api/auth/logout` | Authenticated | Clear session cookie |
| `GET` | `/api/auth/me` | Authenticated | Return currently authenticated user profile |
| `GET` | `/health` | Public | Service health and timestamp check |
| `GET` | `/api/plants` | Authenticated | List all plants |
| `GET` | `/api/areas` | Authenticated | List areas (optional `?plantId=<uuid>`) |
| `GET` | `/api/equipment` | Authenticated | List equipment (optional `?areaId=<uuid>`) |
| `POST` | `/api/permits` | `REQUESTER`, `ADMIN` | Create a new permit in `DRAFT` status |
| `GET` | `/api/permits` | Authenticated | List permits with server-side filters and pagination |
| `GET` | `/api/permits/stats` | Authenticated | Dashboard metrics: byStatus, activeNow, expiringIn2h, pendingMyApproval |
| `GET` | `/api/permits/:id` | Authenticated | Retrieve permit details, approvals, work logs, and allowedActions |
| `PATCH` | `/api/permits/:id` | Owner / `ADMIN` | Update permit parameters with optimistic locking (`version`) |
| `GET` | `/api/permits/:id/audit` | Authenticated | Ordered audit history with "System" attribution (D-018) |
| `POST` | `/api/permits/:id/work-logs` | Authenticated | Record NOTE, ENTRY, or EXIT log on an ACTIVE permit |
| `POST` | `/api/permits/:id/:action` | Role & Guard | Execute state transition (`submit`, `approve`, `reject`, `activate`, etc.) |

---

## Implemented Stage 3 Endpoints

### 1. Health Check
- **Path**: `GET /health`
- **Auth**: Public
- **Success Response (200 OK)**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-11-24T15:00:00.000Z"
  }
  ```

### 2. User Login
- **Path**: `POST /api/auth/login`
- **Auth**: Public (Rate-limited: 5 attempts per 15 minutes per IP)
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "email": "requester@cmms.local",
    "password": "PtwPass2026!"
  }
  ```
- **Success Response (200 OK)**:
  - Header: `Set-Cookie: ptw_token=<jwt>; HttpOnly; SameSite=Lax; Path=/`
  ```json
  {
    "user": {
      "id": "uuid-v4",
      "name": "Rajesh Kumar",
      "email": "requester@cmms.local",
      "role": "REQUESTER"
    }
  }
  ```
- **Error Responses**:
  - `401 UNAUTHORIZED`: `{ "error": { "code": "UNAUTHORIZED", "message": "Invalid email or password" } }` (Identical response for unknown email and bad password, constant-time comparison).
  - `422 VALIDATION_ERROR`: `{ "error": { "code": "VALIDATION_ERROR", "message": "Validation failed", "details": { "email": ["Invalid email address format"] } } }`.
  - `429 RATE_LIMIT_EXCEEDED`: `{ "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "Too many login attempts. Please try again later." } }` with `Retry-After` header.

### 3. User Logout
- **Path**: `POST /api/auth/logout`
- **Auth**: Public / Authenticated
- **Success Response (200 OK)**:
  - Header: `Set-Cookie: ptw_token=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/`
  ```json
  {
    "message": "Logged out successfully"
  }
  ```

### 4. Current User Profile
- **Path**: `GET /api/auth/me`
- **Auth**: Authenticated via `httpOnly` cookie (`requireAuth`)
- **Success Response (200 OK)**:
  ```json
  {
    "user": {
      "id": "uuid-v4",
      "name": "Rajesh Kumar",
      "email": "requester@cmms.local",
      "role": "REQUESTER"
    }
  }
  ```
- **Error Response**:
  - `401 UNAUTHORIZED`: `{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }` (or `"Invalid or expired authentication token"`).

| `GET` | `/api/permits` | Authenticated | List permits with filters (status, type, areaId, from, to, mine, pendingMyApproval) and pagination |
| `GET` | `/api/permits/stats` | Authenticated | Return aggregated counts (`byStatus`, `activeNow`, `expiringIn2h`, `pendingMyApproval`) |
| `POST` | `/api/permits` | `REQUESTER`, `ADMIN` | Create new draft permit (permissive validation) |
| `GET` | `/api/permits/:id` | Authenticated | Get permit details, approvals, work logs, and computed `allowedActions` |
| `PATCH` | `/api/permits/:id` | Owner / Requester | Update permit (only `DRAFT` or `PENDING_APPROVAL` with approval reset) |
| `POST` | `/api/permits/:id/submit` | Owner / Requester | Submit permit (strict validation & domain rules; creates approval rows) |
| `POST` | `/api/permits/:id/approve` | `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN` | Approve a pending approval row (no self-approval) |
| `POST` | `/api/permits/:id/reject` | `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN` | Reject permit with mandatory comment (no self-approval) |
| `POST` | `/api/permits/:id/activate` | Owner or `SAFETY_OFFICER` | Activate approved permit when `now >= planned_start` and `now < planned_end` |
| `POST` | `/api/permits/:id/suspend` | `SAFETY_OFFICER`, `ADMIN` | Suspend active permit with mandatory reason |
| `POST` | `/api/permits/:id/resume` | `SAFETY_OFFICER` | Resume suspended permit if not expired |
| `POST` | `/api/permits/:id/close` | Owner / Requester | Close active permit with mandatory completion notes |
| `POST` | `/api/permits/:id/verify` | `SAFETY_OFFICER` | Verify closed permit (no self-verification) |
| `POST` | `/api/permits/:id/cancel` | Owner, `SAFETY_OFFICER`, `ADMIN` | Cancel non-terminal permit with mandatory reason |
| `POST` | `/api/permits/:id/work-logs` | Authenticated | Add work log (`NOTE`, `ENTRY`, `EXIT`) — `ACTIVE` permits only |
| `POST` | `/api/permits/:id/extensions` | Owner / Requester | Request permit extension (+N hours, max 4h, max 1 extension) |
| `POST` | `/api/permits/:id/extensions/:extId/decision` | `SAFETY_OFFICER` | Approve or reject extension request |
| `GET` | `/api/permits/:id/audit` | Authenticated | Retrieve ordered timeline of audit events with actor names and diffs |
| `POST` | `/api/internal/sweep` | Header `X-Sweep-Secret` | Overdue permit sweeper endpoint for external cron jobs |
| `CRUD` | `/api/admin/*` | `ADMIN` | Administration CRUD for users, plants, areas, and equipment |

---

## State Machine Engine (Stage 4)

The central state machine controls all permit lifecycle transitions.
All mutations execute inside a PostgreSQL transaction using `SELECT ... FOR UPDATE` row-level locking.

### Transition Table

| Action | Allowed From Statuses | Target Status | Permitted Roles | Required Guards |
|---|---|---|---|---|
| `submit` | `DRAFT` | `PENDING_APPROVAL` | `REQUESTER`, `ADMIN` | Requester ownership, Window check (`end > start`), Submit schema validation (gas test, precautions) |
| `approve` | `PENDING_APPROVAL` | `APPROVED` (or remains `PENDING_APPROVAL`) | `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN` | No self-approval, Area Owner assignment, Pending tier exists, Separation of duties (D-019) |
| `reject` | `PENDING_APPROVAL` | `REJECTED` | `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN` | No self-action, Area Owner assignment, Mandatory comment |
| `activate` | `APPROVED` | `ACTIVE` | `REQUESTER`, `SAFETY_OFFICER`, `ADMIN` | Requester ownership, Current time within window (`start <= now < end`), All approvals `APPROVED`, Confined Space gas test <= 60m (D-010) |
| `suspend` | `ACTIVE` | `SUSPENDED` | `SAFETY_OFFICER`, `ADMIN` | Mandatory comment/reason |
| `resume` | `SUSPENDED` | `ACTIVE` | `SAFETY_OFFICER`, `ADMIN` | Not expired (`now < planned_end`) |
| `close` | `ACTIVE` | `CLOSED` | `REQUESTER`, `SAFETY_OFFICER`, `ADMIN` | Requester ownership, Mandatory completion notes |
| `verify` | `CLOSED` | `CLOSED_VERIFIED` | `SAFETY_OFFICER`, `ADMIN` | No self-verification (verifier cannot be the permit requester) |
| `cancel` | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `SUSPENDED` | `CANCELLED` | `REQUESTER`, `SAFETY_OFFICER`, `ADMIN` | Requester ownership, Mandatory comment |
| `expire` | `APPROVED`, `ACTIVE`, `SUSPENDED` | `EXPIRED` | `SYSTEM`, `ADMIN` | None (automated lazy expiry or cron sweeper) |

### Persistent Lazy Expiry

When any permit in an expirable status (`APPROVED`, `ACTIVE`, `SUSPENDED`) is accessed for a transition and `now >= planned_end`:
1. The transition engine updates the permit `status = 'EXPIRED'`, increments `version`, and commits immediately to PostgreSQL.
2. It writes an audit log entry attributing the action to `SYSTEM` (`actor_id = NULL` per D-018).
3. If the requested action was not `expire`, the engine returns HTTP 409 `ILLEGAL_TRANSITION` explaining that the permit has expired.

### Dynamic Allowed Actions Calculation

`getAllowedActions(permit, actor, approvals, now)` computes the real-time list of valid actions for the given user, state, and timestamp without mutating database state. This array is included in permit details and in all 409 error payloads so the user interface can render active affordances dynamically.

---

## Implemented Stage 5 Endpoints

### 1. Reference Data Endpoints (D-020 Read Access)
- **`GET /api/plants`**: Returns all plants (`[{ id, name }]`).
- **`GET /api/areas?plantId=<uuid>`**: Returns areas with joined area owner details (`ownerId`, `ownerName`, `ownerEmail`).
- **`GET /api/equipment?areaId=<uuid>`**: Returns tagged equipment units (`[{ id, areaId, tag, name }]`).

### 2. Create Permit
- **Path**: `POST /api/permits`
- **Auth**: `REQUESTER` or `ADMIN`
- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "type": "HOT_WORK",
    "plantId": "uuid",
    "areaId": "uuid",
    "equipmentId": "uuid",
    "contractorTeam": "Apex Piping Contractors",
    "workDescription": "Welding bypass line flange",
    "plannedStart": "2026-07-01T08:00:00.000Z",
    "plannedEnd": "2026-07-01T16:00:00.000Z",
    "hazards": ["Flammable vapor", "Sparks"],
    "ppe": ["Welding helmet", "Safety boots"],
    "details": {
      "hot_work_type": "welding",
      "fire_watch_assigned": true,
      "extinguisher_type": "CO2",
      "combustibles_cleared_radius_m": 15
    }
  }
  ```
- **Validation**:
  - Validates location hierarchy: returns 422 `VALIDATION_ERROR` if area not in plant or equipment not in area.
  - Enforces `plannedEnd > plannedStart`.
  - Details validated using draft-mode rules (permissive on creation).
- **Success Response (201 Created)**: Returns `{ permit }` in `DRAFT` status with `version: 1` and sequential `permitNo: "PTW-YYYY-NNNN"`. Writes initial `'create'` audit record.

### 3. List Permits with Filters & Pagination
- **Path**: `GET /api/permits`
- **Auth**: Universal Read Access (D-020)
- **Query Parameters**:
  - `status`: Filter by `PermitStatus`.
  - `type`: Filter by `PermitTypeCode`.
  - `areaId`: Filter by area UUID.
  - `from`: ISO 8601 string; filters permits where `planned_start >= from`.
  - `to`: ISO 8601 string; filters permits where `planned_end <= to`.
  - `mine`: Boolean (`true`); filters permits requested by current user.
  - `pendingMyApproval`: Boolean (`true`); filters permits currently in `PENDING_APPROVAL` where the current authenticated user has an actionable `approve` transition (reusing the state machine approval guard).
  - `page`: Integer (default: 1).
  - `limit`: Integer (default: 20, max: 100).
  - `sortBy`: `created_at` (default), `planned_start`, `planned_end`, `permit_no`, `status`.
  - `sortDir`: `asc` or `desc` (default).
- **Bulk Expiry Guarantee**: Runs `bulkExpireOverduePermits` before querying, ensuring overdue permits are never returned as active.
- **Success Response (200 OK)**:
  ```json
  {
    "items": [...],
    "pagination": {
      "total": 42,
      "page": 1,
      "limit": 20,
      "totalPages": 3
    }
  }
  ```

### 4. Dashboard Statistics
- **Path**: `GET /api/permits/stats`
- **Auth**: Universal Read Access (D-020)
- **Bulk Expiry Guarantee**: Bulk-expires overdue permits before aggregating counts.
- **Success Response (200 OK)**:
  ```json
  {
    "byStatus": {
      "DRAFT": 2,
      "PENDING_APPROVAL": 3,
      "APPROVED": 1,
      "ACTIVE": 4,
      "SUSPENDED": 1,
      "REJECTED": 2,
      "EXPIRED": 5,
      "CLOSED": 1,
      "CLOSED_VERIFIED": 3,
      "CANCELLED": 1
    },
    "activeNow": 4,
    "expiringIn2h": 1,
    "pendingMyApproval": 2
  }
  ```

### 5. Get Permit Details
- **Path**: `GET /api/permits/:id`
- **Auth**: Universal Read Access (D-020)
- **Success Response (200 OK)**: Returns complete permit record joined with `plantName`, `areaName`, `equipmentTag`, `requesterName`, an `approvals` array with decider metadata, active `workLogs`, and dynamically evaluated `allowedActions` for the current user.

### 6. Update Permit (Optimistic Locking & Mass Assignment Protection)
- **Path**: `PATCH /api/permits/:id`
- **Auth**: Permit Owner or `ADMIN`
- **Status Restriction**: Can only update permits in `DRAFT` or `PENDING_APPROVAL`. Any other status returns 409 `ILLEGAL_TRANSITION`.
- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "version": 1,
    "workDescription": "Updated scope",
    "contractorTeam": "New Contractor Crew"
  }
  ```
- **Optimistic Concurrency**:
  - `version` is mandatory.
  - If incoming `version !== current.version`, returns HTTP 409 `VERSION_CONFLICT`.
  - On update, increments `version = version + 1`.
- **Mass Assignment Protection**:
  - Disallowed fields (`status`, `requesterId`, `permitNo`) are strictly rejected with 422 `VALIDATION_ERROR`.
- **Approval Reset on Pending Edits**:
  - If edited while in `PENDING_APPROVAL`, existing approval rows in `permit_approvals` are deleted and status resets to `DRAFT` with an audit event logging `'reset_approvals'`.
- **Audit Logging**: Inserts an `'update'` record in `audit_log` with before/after state diffs.
- **Success Response (200 OK)**: Returns `{ permit }` with incremented `version`.

### 7. Audit Event Timeline
- **Path**: `GET /api/permits/:id/audit`
- **Auth**: Universal Read Access (D-020)
- **System Actor Labeling**: Formats `actor_id = NULL` events with `actorName: "System"`, `actorRole: "SYSTEM"`, and `actorEmail: "system@cmms.local"` per D-018.
- **Success Response (200 OK)**:
  ```json
  {
    "timeline": [
      {
        "id": "uuid",
        "permitId": "uuid",
        "actorId": "uuid",
        "actorName": "Rajesh Kumar",
        "actorRole": "REQUESTER",
        "action": "create",
        "fromValue": null,
        "toValue": { "status": "DRAFT", "permitNo": "PTW-2026-0001" },
        "comment": "Permit drafted",
        "createdAt": "2026-07-01T08:00:00.000Z"
      },
      {
        "id": "uuid",
        "permitId": "uuid",
        "actorId": null,
        "actorName": "System",
        "actorRole": "SYSTEM",
        "action": "expire",
        "fromValue": { "status": "ACTIVE" },
        "toValue": { "status": "EXPIRED" },
        "comment": "Automated lazy expiry: planned_end window elapsed",
        "createdAt": "2026-07-01T16:00:00.000Z"
      }
    ]
  }
  ```

### 8. Work Logs on Active Permits
- **Path**: `POST /api/permits/:id/work-logs`
- **Auth**: Authenticated User
- **Status Guard**: Restricted strictly to `ACTIVE` permits. Non-active permits return 409 `ILLEGAL_TRANSITION`.
- **Body**:
  ```json
  {
    "kind": "ENTRY",
    "note": "3 technicians entered tank for visual inspection with multi-gas monitors"
  }
  ```
  - Allowed `kind`: `"NOTE"`, `"ENTRY"`, `"EXIT"` (supports Confined Space attendant logs).
- **Success Response (201 Created)**: Returns `{ workLog: { id, permitId, loggedBy, note, kind, createdAt } }`.


