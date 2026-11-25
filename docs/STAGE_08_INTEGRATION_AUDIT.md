# Stage 8: Frontend-Backend Integration Audit

**Date**: 2026-11-24  
**Auditor**: Senior QA & Full-Stack Integration Engineer  
**Baseline Git Commit**: `8eb0613` (`stage-07`)  
**Branch**: `stage/08-integration-qa`  

---

## 1. Executive Summary

A comprehensive source-code and runtime contract audit was conducted between the `@ptw/web` frontend application, the `@ptw/api` backend service, and the `@ptw/shared` schema registry. 

While static TypeScript types and isolated unit/component tests previously passed, an end-to-end integration analysis uncovered **7 concrete contract mismatches and UI affordance gaps** that prevented core operational workflows (such as loading dashboard permit lists, rendering the audit timeline, submitting work logs, verifying closure, and editing drafts) from functioning against the live API.

All identified issues are cataloged below with their root causes, affected files, and minimal safe resolution strategies.

---

## 2. Comprehensive Contract Matrix

| Contract Area | Backend Implementation | Frontend Expectation | Status / Impact |
| :--- | :--- | :--- | :--- |
| **Permit Types** | `HOT_WORK`, `CONFINED_SPACE`, `WORKING_AT_HEIGHT`, `ELECTRICAL_LOTO` | Same 4 codes in `PermitTypeCode` & `TypeBadge` | ✅ **MATCHED** |
| **Permit Statuses** | 10 statuses (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED`, `REJECTED`, `EXPIRED`, `CLOSED`, `CLOSED_VERIFIED`, `CANCELLED`) | Same 10 statuses in `StatusBadge` & `PermitStatus` | ✅ **MATCHED** |
| **Permit List Envelope** | Returns `{ items: Permit[], pagination: { total, page, limit, totalPages } }` | Expected `{ permits: Permit[], total, page, limit, pages }` | ❌ **MISMATCH (CRITICAL)**: Table and dashboard strips render empty |
| **Dashboard Stats Envelope** | Returns `{ byStatus, activeNow, expiringIn2h, pendingMyApproval }` | Expected `{ total, byStatus, activeRightNow, expiringIn2Hours, pendingMyApproval }` | ❌ **MISMATCH (HIGH)**: Total and live active count render 0 |
| **Audit Timeline Route** | Dedicated endpoint `GET /api/permits/:id/audit` returning `{ timeline: [...] }` | Read `data.auditTimeline` from `GET /api/permits/:id` (which returns none) | ❌ **MISMATCH (CRITICAL)**: Audit timeline section on detail page is always empty |
| **Audit Log Field Names** | Returns `actorName`, `actorRole`, `fromValue`, `toValue` | Expected `actor.name`, `actor.role`, `fromStatus`, `toStatus` | ❌ **MISMATCH (HIGH)**: Event details fail to display actor and statuses |
| **Work Log Endpoint Payload** | Schema requires `kind: 'NOTE' \| 'ENTRY' \| 'EXIT'`, `note: string` | Sent `{ entryType: 'PROGRESS' \| 'GAS_TEST' ..., notes: string }` | ❌ **MISMATCH (CRITICAL)**: Returns 422 VALIDATION_ERROR on submit |
| **Work Log Rendering** | Backend returns `{ id, permitId, loggedBy, loggedByName, note, kind, createdAt }` | Component rendered `{log.entryType}`, `{log.author.name}`, `{log.notes}` | ❌ **MISMATCH (HIGH)**: Existing work logs render blank text and author |
| **Closure Verification Action** | Route is `POST /:id/verify`, action name is `'verify'` | Called `POST /:id/verify-closure`, action name `'verify_closure'` | ❌ **MISMATCH (CRITICAL)**: 404 Not Found on verifying closure; button unmapped |
| **Close Permit Payload** | Schema expects `completion_notes: string` (snake_case) | Sent `completionNotes: string` (camelCase) | ❌ **MISMATCH (HIGH)**: Completion notes saved as `NULL` in database |
| **Permit List Sort Query** | Query schema expects `sortDir: 'asc' \| 'desc'` | Query sent `sortOrder: 'asc' \| 'desc'` | ⚠️ **MISMATCH (LOW)**: Sorting direction ignored by backend schema |
| **Reference Data** | Plants (`/api/plants`), Areas (`/api/areas`), Equipment (`/api/equipment`) | Matches `Plant[]`, `Area[]`, `Equipment[]` | ✅ **MATCHED** |
| **Authentication & Roles** | HttpOnly cookie `ptw_token`, 4 roles (`REQUESTER`, `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN`) | `AuthContext` with `credentials: 'include'` and demo credentials bar | ✅ **MATCHED** |
| **Draft Reopening & Editing** | `PATCH /api/permits/:id` with optimistic lock `version` | No "Edit Draft" affordance in `PermitDetailPage` | ⚠️ **AFFORDANCE GAP**: Cannot edit draft from UI (Workflow A step 5) |

---

## 3. Detailed Mismatch Specifications

### Mismatch 1: Permit List Response Envelope
- **Files**: `apps/api/src/modules/permits/permits.service.ts` (lines 584–592) vs `apps/web/src/api/client.ts` & `apps/web/src/pages/PermitsListPage.tsx`
- **Root Cause**: Backend returns `{ items: [...], pagination: { total, page, limit, totalPages } }`. The frontend code expected `{ permits: [...], total, page, limit, pages }`.
- **Impact**: All list views (`PermitsListPage`, `DashboardPage` Active strip, Pending My Approval list, and Recent Activity list) fail to find `.permits` and render as empty lists.
- **Resolution**: Normalize in `apps/web/src/api/client.ts` `getPermits()` so it unpacks `res.items` into `permits` and extracts `pagination` properties onto the root response.

### Mismatch 2: Dashboard Statistics Response Envelope
- **Files**: `apps/api/src/modules/permits/permits.service.ts` (lines 672–677) vs `apps/web/src/pages/DashboardPage.tsx`
- **Root Cause**: Backend returns `{ byStatus, activeNow, expiringIn2h, pendingMyApproval }`. The frontend expected `activeRightNow`, `expiringIn2Hours`, and `total`.
- **Impact**: The "Total Permits" and "Active Live" stat cards on the dashboard always display `0`.
- **Resolution**: In `api.getDashboardStats()`, compute `total = sum(byStatus)` and provide aliases `activeRightNow: raw.activeNow`, `expiringIn2Hours: raw.expiringIn2h`.

### Mismatch 3: Permit Detail Audit Timeline Retrieval & Field Mapping
- **Files**: `apps/api/src/modules/permits/permits.service.ts` (lines 684–714) vs `apps/web/src/pages/PermitDetailPage.tsx`
- **Root Cause**: `GET /api/permits/:id` does NOT return `auditTimeline`. The backend provides `GET /api/permits/:id/audit` which returns `{ timeline: [...] }`. Furthermore, the timeline rows use `actorName`, `actorRole`, `fromValue`, and `toValue`.
- **Impact**: The audit timeline component is always empty because `data?.auditTimeline` was `undefined`.
- **Resolution**: 
  1. Add `getAuditTimeline: (id: string) => request<{ timeline: AuditLogEntry[] }>(...)` to `api/client.ts`.
  2. In `PermitDetailPage.tsx`, fetch the timeline via a dedicated `useQuery` query.
  3. Render `entry.actorName || 'System'`, `entry.fromValue`, and `entry.toValue`.

### Mismatch 4: Work Log Submission Payload & Rendering
- **Files**: `apps/api/src/modules/permits/permits.schema.ts` (line 65) vs `apps/web/src/pages/PermitDetailPage.tsx` (lines 610–645) & `apps/web/src/api/client.ts` (line 187)
- **Root Cause**: 
  - Backend schema: `kind: z.enum(['NOTE', 'ENTRY', 'EXIT'])`, `note: z.string().min(1)`.
  - Frontend sent: `{ entryType: 'PROGRESS', notes: '...' }`.
  - Backend DB check constraint enforces `kind IN ('NOTE', 'ENTRY', 'EXIT')`.
  - Backend response field names are `kind`, `note`, `loggedByName`.
- **Impact**: Any attempt to add a work log failed with `422 VALIDATION_ERROR`.
- **Resolution**: 
  1. Update `api.addWorkLog` to send `{ kind, note }`.
  2. Update dropdown in `PermitDetailPage.tsx` to options `'NOTE'`, `'ENTRY'`, `'EXIT'`.
  3. Update work log item rendering to read `log.kind`, `log.loggedByName`, `log.note`.

### Mismatch 5: Closure Verification Action Identifier & Route
- **Files**: `apps/api/src/modules/permits/permits.routes.ts` (line 98) & `apps/api/src/modules/permits/state-machine/transitions.ts` (line 88) vs `apps/web/src/api/client.ts` (line 175) & `apps/web/src/pages/PermitDetailPage.tsx` (line 93)
- **Root Cause**: Backend action name is `'verify'` and route is `POST /api/permits/:id/verify`. Frontend expected action `'verify_closure'` and called `POST /api/permits/:id/verify-closure`.
- **Impact**: The "Verify Closure" button did not match the backend `allowedActions` array, and if triggered, returned `404 Not Found`.
- **Resolution**: Update route in `client.ts` to `/api/permits/${id}/verify` and support `'verify'` in `PermitAction`, `PermitDetailPage.tsx`, and `@ptw/shared`.

### Mismatch 6: Close Permit Completion Notes Parameter
- **Files**: `apps/api/src/modules/permits/permits.schema.ts` (line 74) & `apps/api/src/modules/permits/state-machine/transition-engine.ts` (line 366) vs `apps/web/src/api/client.ts` (line 168)
- **Root Cause**: Backend expects `completion_notes` (snake_case). Frontend sent `completionNotes` (camelCase).
- **Impact**: When closing a permit, `completion_notes` was saved as `NULL` in the database.
- **Resolution**: Map `completionNotes` to `completion_notes` in `api.closePermit()`.

### Mismatch 7: Permit List Sort Parameter
- **Files**: `apps/api/src/modules/permits/permits.schema.ts` (line 62) vs `apps/web/src/api/client.ts` (line 108)
- **Root Cause**: Backend parameter is `sortDir`. Frontend sent `sortOrder`.
- **Impact**: Sorting direction was ignored and fell back to default `'desc'`.
- **Resolution**: In `api.getPermits()`, send `params.set('sortDir', query.sortOrder || query.sortDir)`.

---

## 4. Proposed Resolution Plan

1. **Step 1: Update `@ptw/shared` Statuses & Actions**:
   - Ensure `PermitAction.VERIFY = 'verify'` is available alongside `'verify_closure'` for backwards compatibility.
2. **Step 2: Update `apps/web/src/api/client.ts`**:
   - Normalize `getPermits` to return both `{ permits, total, pages, page, limit }` and `{ items, pagination }`.
   - Normalize `getDashboardStats` to compute `total` and provide `activeRightNow` / `expiringIn2Hours`.
   - Add `getAuditTimeline(permitId)`.
   - Fix `addWorkLog` to accept and send `{ kind: 'NOTE' | 'ENTRY' | 'EXIT', note: string }`.
   - Fix `verifyClosure` / `verify` to call `POST /api/permits/${id}/verify`.
   - Fix `closePermit` to pass `completion_notes`.
   - Map `sortOrder` to `sortDir` in `getPermits`.
3. **Step 3: Update `apps/web/src/pages/PermitDetailPage.tsx`**:
   - Fetch audit timeline using `api.getAuditTimeline(id)` in a dedicated TanStack query.
   - Update work log category options to `'NOTE'`, `'ENTRY'`, `'EXIT'`.
   - Render work log fields `log.kind`, `log.loggedByName`, `log.note`.
   - Handle action `'verify'` in the action toolbar.
   - Add an "Edit Permit" modal for permits in `DRAFT` or `PENDING_APPROVAL` status to satisfy Workflow A step 5.
4. **Step 4: Execute & Automate End-to-End User Workflows**:
   - Create an automated integration test suite verifying Workflows A through F against the live PostgreSQL database.
   - Test all four permit types (`HOT_WORK`, `CONFINED_SPACE`, `WORKING_AT_HEIGHT`, `ELECTRICAL_LOTO`).
5. **Step 5: Verify Security & UX Controls**:
   - Verify cookie-only auth (no JWT in localStorage).
   - Test unauthorized transitions and 403/409/422 error states.
6. **Step 6: Monorepo Final Verification**:
   - Run `npm test`, `npm run typecheck`, and `npm run build`.

---

## 5. Browser Testing & UI Visual Verification

- **Status**: **UNVERIFIED (Manual audit only; automated headless browser tests pending)**
- **Audit Declaration**:
  - Live HTTP API endpoints, session cookie transmission, four-role authorization boundaries, dynamic Zod schemas, optimistic concurrency versioning, and state-machine transitions have been thoroughly verified via automated integration tests (`apps/api/src/modules/permits/integration-workflows.test.ts` and `apps/web/src/api/client.test.ts`).
  - However, full end-to-end browser execution (such as Playwright or Puppeteer driving a live browser binary to render CSS layouts, click modals, and verify visual animations) has **NOT** been executed in this headless sandbox environment due to the absence of an installed browser binary.
  - Manual UI audit confirmed static JSX structure, input field handlers, Tailwind CSS styling tokens, and modal state management in source code.
  - Automated headless browser smoke testing remains marked as **UNVERIFIED (Manual)** until a dedicated browser runner is configured.
