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
- `400 MALFORMED_JSON`: Malformed JSON syntax in request body.
- `401 UNAUTHENTICATED`: Session missing or expired.
- `403 FORBIDDEN`: Insufficient role or forbidden authorization action.
  - `SELF_APPROVAL_FORBIDDEN`: Actor cannot approve, reject, or verify their own permit.
  - `WRONG_AREA`: Area Owner can only approve permits for their assigned area.
  - `ROLE_NOT_ALLOWED`: User does not hold the required role for this transition.
  - `NOT_PERMIT_OWNER`: `submit`, `activate`, `close`, and `cancel` are restricted to `permit.requesterId` or `ADMIN` (`D-031`).
  - `DUTIES_SEPARATION_VIOLATION`: Same individual cannot sign off multiple approval tiers (`D-019`) or verify a closure they executed (`D-031`).
- `404 NOT_FOUND`: Resource does not exist.
- `409 ILLEGAL_TRANSITION`: State transition not permitted in current lifecycle state (e.g. attempting to activate DRAFT or modify EXPIRED). Details include `{ from, action, allowedActions }`.
- `409 EARLY_ACTIVATION`: Cannot activate permit before `plannedStart`.
- `409 STALE_GAS_TEST`: For `CONFINED_SPACE` permits, atmospheric gas test must be verified within 60 minutes of activation (D-010).
- `409 PENDING_APPROVALS`: All approval tiers must be `APPROVED` before activation.
- `409 CANNOT_MODIFY_SELF`: Admin cannot demote their own role or deactivate their own account.
- `409 LAST_ADMIN`: Cannot demote or deactivate the last remaining active `ADMIN`.
- `409 REASSIGN_AREAS_FIRST`: Cannot remove `AREA_OWNER` role or deactivate an owner while they still own areas (`details.areas` lists owned areas).
- `409 EMAIL_TAKEN`: Email address already belongs to an existing user account.
- `409 CODE_TAKEN`: Duplicate plant code, duplicate area code within the same plant, or duplicate equipment tag.
- `409 HAS_OPEN_PERMITS`: Cannot deactivate a plant, area, or equipment item referenced by non-terminal permits (`details.permitNos` lists affected permits).
- `409 HAS_ACTIVE_CHILDREN`: Cannot deactivate a plant with active areas or an area with active equipment (no cascade deactivation per `D-029`).
- `413 PAYLOAD_TOO_LARGE`: JSON payload exceeds configured server body limit (`100kb`).
- `422 INVALID_ID`: Invalid UUID syntax in `:id` route parameter.
- `422 VALIDATION_ERROR`: Zod validation failure. Details include `{ path, message, code }[]`.
- `422 UNSAFE_ATMOSPHERE`: Gas/atmosphere readings violate `GAS_SAFETY_THRESHOLDS` on permit submission (`D-032`; `details.offendingReadings` lists failing readings).
- `422 MISSING_COMPLETION_NOTES`: Mandatory non-empty trimmed `completionNotes` (or `completion_notes`) required when closing a permit (D-005).
- `422 MISSING_COMMENT`: Mandatory non-empty trimmed `comment` required for `reject`, `suspend`, and `cancel` (D-005).
- `429 RATE_LIMITED`: Rate limit exceeded for authentication or sweep triggers.

---

## Endpoints Table (Target Specification)

| Method | Path | Required Role / Guard | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticate user, set `httpOnly` JWT cookie |
| `POST` | `/api/auth/logout` | Authenticated | Clear session cookie |
| `GET` | `/api/auth/me` | Authenticated | Return currently authenticated user profile |
| `GET` | `/health` | Public | Service health and timestamp check |
| `GET` | `/api/plants` | Authenticated | List active plants (`?includeInactive=true` allowed for `ADMIN` only -> `403 FORBIDDEN` otherwise) |
| `GET` | `/api/areas` | Authenticated | List active areas in active plants (optional `?plantId=<uuid>`, `ADMIN`-only `?includeInactive=true`) |
| `GET` | `/api/equipment` | Authenticated | List active equipment in active areas/plants (optional `?areaId=<uuid>`, `ADMIN`-only `?includeInactive=true`) |
| `GET` | `/api/admin/users` | `ADMIN` | List all users (active and deactivated) with owned areas |
| `POST` | `/api/admin/users` | `ADMIN` | Create user (`409 EMAIL_TAKEN`, min 12-char password) |
| `PATCH` | `/api/admin/users/:id` | `ADMIN` | Update user name, role, `isActive`, or `areaIds` (`409 CANNOT_MODIFY_SELF`, `LAST_ADMIN`, `REASSIGN_AREAS_FIRST`) |
| `POST` | `/api/admin/users/:id/reset-password` | `ADMIN` | Reset user password (min 12 chars, scrubbed from audit log) |
| `GET` | `/api/admin/plants` | `ADMIN` | List all plants (including deactivated) with `areaCount` |
| `POST` | `/api/admin/plants` | `ADMIN` | Create plant (`409 CODE_TAKEN`) |
| `PATCH` | `/api/admin/plants/:id` | `ADMIN` | Update/deactivate/reactivate plant (`409 CODE_TAKEN`, `HAS_OPEN_PERMITS`, `HAS_ACTIVE_CHILDREN`) |
| `GET` | `/api/admin/areas` | `ADMIN` | List all areas (optional `?plantId=<uuid>`) with owner and plant details |
| `POST` | `/api/admin/areas` | `ADMIN` | Create area bound to active plant & active `AREA_OWNER` (`409 CODE_TAKEN`) |
| `PATCH` | `/api/admin/areas/:id` | `ADMIN` | Update/reassign/deactivate area (`D-028` moves `PENDING` approvals on owner change) |
| `GET` | `/api/admin/equipment` | `ADMIN` | List all equipment (optional `?areaId=<uuid>`) |
| `POST` | `/api/admin/equipment` | `ADMIN` | Create equipment bound to active area (`409 CODE_TAKEN`) |
| `PATCH` | `/api/admin/equipment/:id` | `ADMIN` | Update/deactivate/reactivate equipment (`409 CODE_TAKEN`, `HAS_OPEN_PERMITS`) |
| `GET` | `/api/admin/activity` | `ADMIN` | Paginated append-only `admin_audit_log` (`?entityType=&page=&limit=`) |
| `POST` | `/api/permits` | `REQUESTER`, `ADMIN` | Create a new permit in `DRAFT` status |
| `GET` | `/api/permits` | Authenticated | List permits with server-side filters and pagination |
| `GET` | `/api/permits/stats` | Authenticated | Dashboard metrics: byStatus, activeNow, expiringIn2h, pendingMyApproval |
| `GET` | `/api/permits/:id` | Authenticated | Retrieve permit details, approvals, work logs, and allowedActions |
| `PATCH` | `/api/permits/:id` | Owner / `ADMIN` | Update permit parameters with optimistic locking (`version`) |
| `GET` | `/api/permits/:id/audit` | Authenticated | Ordered audit history with "System" attribution (D-018) |
| `POST` | `/api/permits/:id/work-logs` | Authenticated | Record NOTE, ENTRY, or EXIT log on an ACTIVE permit |
| `POST` | `/api/permits/:id/:action` | Role & Guard | Execute state transition (`submit`, `approve`, `reject`, `activate`, etc.) |
| `POST` | `/internal/sweep` | Internal Header | Trigger immediate bulk expiry sweep; protected by `X-Sweep-Secret` |

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

| `GET` | `/api/permits` | Authenticated (Draft-scoped) | List permits visible to caller (`DRAFT` limited to owner/`ADMIN`, `PENDING_APPROVAL+` all users per `D-033`); filters (`status`, `type`, `plantId`, `areaId`, `search`, `from`, `to`, `mine`, `pendingMyApproval`) & pagination |
| `GET` | `/api/permits/stats` | Authenticated (Draft-scoped) | Return aggregated counts visible to caller (`byStatus`, `activeNow`, `expiringIn2h`, `pendingMyApproval`; excludes others' `DRAFT`s per `D-033`) |
| `POST` | `/api/permits` | `REQUESTER`, `SAFETY_OFFICER`, `ADMIN` | Create new draft permit (permissive validation, persists `precautions`) |
| `GET` | `/api/permits/:id` | Authenticated (Draft-scoped) | Get permit details, approvals, work logs, precautions, and computed `allowedActions` (`404` for another user's `DRAFT`; `submit` always included for owner/`ADMIN` on `DRAFT`) |
| `PATCH` | `/api/permits/:id` | Owner or `ADMIN` | Update any editable field (`type` in `DRAFT`, `plantId`, `areaId`, `equipmentId`, dates, description, crew, `hazards`, `ppe`, `precautions`, `details`; `404` if non-owner hits `DRAFT`, `403` on `PENDING_APPROVAL`) |
| `POST` | `/api/permits/:id/submit` | Owner or `ADMIN` | Submit permit (returns `422` with per-field paths in `details` when incomplete/missing equipment or unsafe gas; `404` for non-owner on `DRAFT`) |
| `POST` | `/api/permits/:id/approve` | `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN` | Approve a pending approval row (no self-approval) |
| `POST` | `/api/permits/:id/reject` | `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN` | Reject permit with mandatory non-empty trimmed comment (no self-approval) |
| `POST` | `/api/permits/:id/activate` | Owner or `ADMIN` | Activate approved permit when `now >= planned_start` and `now < planned_end` |
| `POST` | `/api/permits/:id/suspend` | `SAFETY_OFFICER`, `ADMIN` | Suspend active permit with mandatory non-empty trimmed reason |
| `POST` | `/api/permits/:id/resume` | `SAFETY_OFFICER`, `ADMIN` | Resume suspended permit if not expired |
| `POST` | `/api/permits/:id/close` | Owner or `ADMIN` | Close active permit with mandatory non-empty trimmed `completionNotes` |
| `POST` | `/api/permits/:id/verify` | Independent `SAFETY_OFFICER` or `ADMIN` | Verify closed permit (verifier cannot be requester or closer) |
| `POST` | `/api/permits/:id/cancel` | Owner or `ADMIN` | Cancel non-terminal permit with mandatory non-empty trimmed reason |
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
| `submit` | `DRAFT` | `PENDING_APPROVAL` | `REQUESTER`, `SAFETY_OFFICER`, `ADMIN` | Requester ownership or `ADMIN` (`D-031`), Window check (`end > start`), Submit schema validation & safe gas thresholds (`422 UNSAFE_ATMOSPHERE`) |
| `approve` | `PENDING_APPROVAL` | `APPROVED` (or remains `PENDING_APPROVAL`) | `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN` | No self-approval, Area Owner assignment, Pending tier exists, Separation of duties (D-019) |
| `reject` | `PENDING_APPROVAL` | `REJECTED` | `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN` | No self-action, Area Owner assignment, Mandatory non-empty trimmed comment |
| `activate` | `APPROVED` | `ACTIVE` | `REQUESTER`, `SAFETY_OFFICER`, `ADMIN` | Requester ownership or `ADMIN` (`D-031`), Current time within window (`start <= now < end`), All approvals `APPROVED`, Confined Space gas test <= 60m (D-010) |
| `suspend` | `ACTIVE` | `SUSPENDED` | `SAFETY_OFFICER`, `ADMIN` | Mandatory non-empty trimmed comment/reason |
| `resume` | `SUSPENDED` | `ACTIVE` | `SAFETY_OFFICER`, `ADMIN` | Not expired (`now < planned_end`) |
| `close` | `ACTIVE` | `CLOSED` | `REQUESTER`, `SAFETY_OFFICER`, `ADMIN` | Requester ownership or `ADMIN` (`D-031`), Mandatory non-empty trimmed `completionNotes` |
| `verify` | `CLOSED` | `CLOSED_VERIFIED` | `SAFETY_OFFICER`, `ADMIN` | No self-verification (`requesterId`) and closer separation (`D-031`: `closedBy !== actor.id`) |
| `cancel` | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `SUSPENDED` | `CANCELLED` | `REQUESTER`, `SAFETY_OFFICER`, `ADMIN` | Requester ownership or `ADMIN` (`D-031`), Mandatory non-empty trimmed comment |
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

---

## Implemented Stage 6 Endpoints: Background Sweeper & Internal Operations

### 9. Immediate Expiry Sweep (Internal Endpoint)
- **Path**: `POST /internal/sweep`
- **Auth**: Protected by request header `X-Sweep-Secret` matching `SWEEP_SECRET` (minimum 32 characters, verified using `crypto.timingSafeEqual` constant-time comparison).
- **Security Invariant**: The secret is never logged or echoed in responses. Mismatched or missing headers return an identical sanitized HTTP 401 response.
- **Headers**:
  - `X-Sweep-Secret: <SWEEP_SECRET>`
- **Response Semantics**:
  - `scanned`: Total candidate permits examined and row-locked via `SELECT ... FOR UPDATE SKIP LOCKED` during this sweep cycle.
  - `expiredCount`: Total permits successfully transitioned to `EXPIRED` with audit records written.
  - `expiredPermitIds`: Array of permit ID strings successfully expired by this execution.
  - Strictly guarantees: `expiredCount === expiredPermitIds.length`.
- **Success Response (200 OK)**:
  ```json
  {
    "scanned": 3,
    "expiredCount": 3,
    "expiredPermitIds": [
      "a6f3b0d2-7c3a-4e2b-8a5e-1d6f2c3b4a5e",
      "b7e4c1e3-8d4b-5f3c-9b6f-2e7a3d4c5b6f",
      "c8f5d2f4-9e5c-6a4d-0c7a-3f8b4e5d6c7a"
    ]
  }
  ```
- **Error Responses**:
  - `401 UNAUTHORIZED`: Returned when `X-Sweep-Secret` is missing, incorrect, or of different buffer length.
    ```json
    {
      "error": {
        "code": "UNAUTHORIZED",
        "message": "Invalid or missing sweep secret"
      }
    }
    ```

---

## Implemented Admin Management Endpoints (`/api/admin/*`)

All `/api/admin/*` endpoints require an authenticated session (`401 UNAUTHENTICATED`) with `role === 'ADMIN'` (`403 FORBIDDEN` via `requireRole(UserRole.ADMIN)`). Sensitive mutations (`POST /api/admin/users`, `POST /api/admin/users/:id/reset-password`) are additionally protected by `adminRateLimiter` (`429 RATE_LIMIT_EXCEEDED`). Every mutation runs inside a SQL transaction and appends a scrubbed event to `admin_audit_log`.

### 10. Users Management
- **`GET /api/admin/users`**: Returns `{ users: UserDto[] }` with `ownedAreas`.
- **`POST /api/admin/users`**: Body `{ name, email, password, role, areaIds? }` (`password` >= 12 chars). Returns `201 { user }` or `409 EMAIL_TAKEN`. Note: `AREA_OWNER` users are not required to own an area at creation.
- **`PATCH /api/admin/users/:id`**: Body `{ name?, role?, isActive?, areaIds? }`. Returns `200 { user }`.
  - Guards: `409 CANNOT_MODIFY_SELF`, `409 LAST_ADMIN`, `409 REASSIGN_AREAS_FIRST` (includes `{ areas }` in `details`).
- **`POST /api/admin/users/:id/reset-password`**: Body `{ password }` (>= 12 chars). Updates bcrypt hash and records `{ passwordUpdated: true }` in `admin_audit_log` (never hashes or secrets).

### 11. Plants, Areas & Equipment Management
- **`GET / POST / PATCH /api/admin/plants`**: Returns `{ plants }` / `{ plant }`. Guards: `409 CODE_TAKEN`, `409 HAS_OPEN_PERMITS`, `409 HAS_ACTIVE_CHILDREN`.
- **`GET / POST / PATCH /api/admin/areas`**: Returns `{ areas }` / `{ area }`. Requires active `AREA_OWNER` (`422` otherwise). Changing `ownerId` executes `D-028` (atomically reassigning `PENDING` `AREA_OWNER` rows on non-terminal permits and writing `approver_reassigned` entries to `audit_log`).
- **`GET / POST / PATCH /api/admin/equipment`**: Returns `{ equipment }` (`tag` standardized) / `{ equipment }`. Guards: `409 CODE_TAKEN`, `409 HAS_OPEN_PERMITS`.

### 12. Admin Activity Audit Log
- **`GET /api/admin/activity?entityType=USER|PLANT|AREA|EQUIPMENT&page=1&limit=20`**: Returns `{ items: AdminAuditLogDto[], pagination }` ordered newest-first.




