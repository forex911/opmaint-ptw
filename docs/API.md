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
- `422 VALIDATION_ERROR`: Zod validation failure. Details include `{ path, message, code }[]`.

---

## Endpoints Table (Target Specification)

| Method | Path | Required Role / Guard | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticate user, set `httpOnly` JWT cookie |
| `POST` | `/api/auth/logout` | Authenticated | Clear session cookie |
| `GET` | `/api/auth/me` | Authenticated | Return currently authenticated user profile |
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
