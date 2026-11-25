# OPMAINT CMMS — STAGE 8C: FINAL FUNCTIONAL & ASSIGNMENT COMPLIANCE AUDIT

**Date**: 2026-11-25  
**Auditor**: Senior QA Engineer & Industrial CMMS Domain Specialist  
**Target Commit**: `4e2ffec` (main branch)  
**Verification Scope**: Assignment Compliance, Permit Types, State Machine Lifecycle, Four-Eyes Principle, Data & Audit Immutability, Live Browser Walkthrough, and Production Readiness.

---

## 1. Executive Summary

This Stage 8C audit provides the definitive functional and compliance evaluation of the OPMAINT Permit to Work (PTW) module prior to production deployment. Every claim in this document is substantiated by running code inspections, automated unit/integration test suites (264/264 passing), database constraint verifications, and an automated end-to-end live browser walkthrough with captured screenshots and video recordings.

### Audit Verdict: **PASSED — READY FOR DEPLOYMENT (ZERO BLOCKERS)**

| Area | Status | Evidence |
|---|---|---|
| **1. Assignment Compliance** | **100% Compliant** | All 4 required industrial permit types exist without substitution. |
| **2. Lifecycle Engine** | **100% Compliant** | 10 states, 11 transition actions, all strict guards enforced. |
| **3. Four-Eyes & Roles** | **100% Compliant** | No self-approval, area owner matching, dual authorization verified. |
| **4. Data & Audit Integrity** | **100% Compliant** | Append-only audit trigger active; equipment optional on draft, required on submit (D-025). |
| **5. Live Browser Verification** | **100% Compliant** | Full 16-step interactive workflow executed with 16 screenshots and video. |
| **6. Production Readiness** | **100% Compliant** | Decoupled migrations (D-026), secure cookie/CORS, zero secrets in client bundles. |

---

## 2. Assignment Compliance Matrix

| Requirement | Specification Rule | Actual Implementation | Audit Finding |
|---|---|---|---|
| **Hot Work** | Welding, torch cutting, grinding, open flame | `PermitTypeCode.HOT_WORK` in `@ptw/shared/src/registry/definitions.ts` | **PASS** — Active & tested |
| **Confined Space Entry** | Tanks, silos, restricted egress, gas testing | `PermitTypeCode.CONFINED_SPACE` with mandatory O2, LEL, H2S, CO | **PASS** — Active & tested |
| **Working at Height** | Fall arrest, scaffolding, ladder, >1.8m | `PermitTypeCode.WORKING_AT_HEIGHT` (no COLD_WORK substitution) | **PASS** — Active & tested |
| **Electrical Isolation (LOTO)** | Lockout/tagout, voltage, earthing, dead-test | `PermitTypeCode.ELECTRICAL_LOTO` with isolation/lock lists | **PASS** — Active & tested |
| **Zero-Code Extensibility** | 5th type addition requires zero DB changes | Dynamic Zod compilation from registry to `details JSONB` | **PASS** — Verified in Stage 1 |
| **Database Check Constraint** | SQL validation of valid types | `permits_type_check CHECK (type IN ('HOT_WORK', 'CONFINED_SPACE', 'WORKING_AT_HEIGHT', 'ELECTRICAL_LOTO'))` | **PASS** — Migration 0001 |

---

## 3. Permit Type Deep-Dive Verification

### 3.1 Hot Work (`HOT_WORK`)
- **Dynamic Fields**: `hot_work_type` (select: welding, grinding, cutting, soldering), `fire_watch_assigned` (boolean), `extinguisher_type` (text), `combustibles_cleared_radius_m` (min 0m), `gas_test` (`lel_pct`, `o2_pct`, `tested_at`).
- **Domain Rules**: Gas test readings required on submission; fire watch must be designated.
- **Frontend Badging**: Flame icon with industrial amber palette (`bg-amber-100 text-amber-900`).

### 3.2 Confined Space Entry (`CONFINED_SPACE`)
- **Dynamic Fields**: `space_id` (text), `entry_point` (text), `atmosphere_test` (`o2_pct`, `lel_pct`, `h2s_ppm`, `co_ppm`, `tested_at`), `standby_attendant` (text), `rescue_plan` (text), `ventilation_method` (select: forced_mechanical, natural_draft, local_exhaust, continuous_purge).
- **Domain Rules**:
  - **D-004**: Gas test must be recorded within 60 minutes prior to planned start.
  - **D-010**: Gas test freshness re-verified upon permit activation (`guardActivation`).
- **Frontend Badging**: Vessel box icon with industrial blue palette (`bg-blue-100 text-blue-900`).

### 3.3 Working at Height (`WORKING_AT_HEIGHT`)
- **Dynamic Fields**: `height_m` (min 0m), `access_method` (select: scaffold, ladder, MEWP, rope), `fall_arrest_equipment` (text), `anchor_point_checked` (boolean), `barricading_below` (boolean).
- **Domain Rules**: Enforces certified anchor points and drop-zone barricading on submission.
- **Frontend Badging**: Arrow-up-right icon with emerald palette (`bg-emerald-100 text-emerald-900`).

### 3.4 Electrical Isolation / LOTO (`ELECTRICAL_LOTO`)
- **Dynamic Fields**: `equipment_tag` (text), `voltage_level` (text), `isolation_points` (string list), `lock_numbers` (string list), `tag_numbers` (string list), `earthing_applied` (boolean), `zero_energy_verified` (boolean).
- **Domain Rules**: Lock numbers and danger tags required; dead-test zero energy verification strictly required prior to authorization.
- **Frontend Badging**: High-voltage zap icon with purple palette (`bg-purple-100 text-purple-900`).

---

## 4. Lifecycle & State Machine Verification

The state machine implements a pure, deterministic transition engine with row-level pessimistic locking (`SELECT ... FOR UPDATE`):

```
               ┌──────────┐
               │  DRAFT   │
               └────┬─────┘
                    │ submit (guardSubmitEquipment, guardSubmitDetails)
                    ▼
           ┌─────────────────┐       reject
           │ PENDING_APPROVAL├────────────────────┐
           └────────┬────────┘                    │
                    │ approve (all tiers signed)  │
                    ▼                             ▼
              ┌───────────┐                 ┌──────────┐
              │ APPROVED  │                 │ REJECTED │
              └─────┬─────┘                 └──────────┘
                    │ activate (now >= start)
                    ▼
               ┌──────────┐
    ┌─────────►│  ACTIVE  ├──────────┐
    │          └────┬─────┘          │
    │ resume        │ suspend        │ close (mandatory completion notes)
    │               ▼                ▼
    │         ┌───────────┐     ┌──────────┐
    └─────────┤ SUSPENDED │     │  CLOSED  │
              └───────────┘     └────┬─────┘
                                     │ verify (Safety Officer / Admin)
                                     ▼
                              ┌───────────────┐
                              │CLOSED_VERIFIED│
                              └───────────────┘

* Note: CANCEL is permitted from DRAFT, PENDING_APPROVAL, APPROVED, and SUSPENDED.
* Note: EXPIRE is triggered automatically whenever now >= planned_end.
```

### Transition Invariants Verified
1. **DRAFT -> PENDING_APPROVAL (`submit`)**: Requires requester ownership, valid date window (`plannedEnd > plannedStart`), valid equipment in chosen area (D-025), and complete type-specific safety checklist.
2. **PENDING_APPROVAL -> APPROVED (`approve`)**: Re-evaluates all approval rows. Remains `PENDING_APPROVAL` after individual tier sign-off; transitions to `APPROVED` only when `every((a) => a.status === 'APPROVED')`.
3. **APPROVED -> ACTIVE (`activate`)**: Strictly blocked if `now < plannedStart` (409 `EARLY_ACTIVATION`) or if gas test is stale on Confined Space (D-010).
4. **ACTIVE -> SUSPENDED (`suspend`)**: Immediately revokes active work authorization; work logs cannot be created while suspended.
5. **SUSPENDED -> ACTIVE (`resume`)**: Restores active state if `now < plannedEnd`.
6. **ACTIVE -> CLOSED (`close`)**: Strictly requires non-empty `completionNotes` (422 `MISSING_COMPLETION_NOTES`).
7. **CLOSED -> CLOSED_VERIFIED (`verify`)**: Restricted to Safety Officer or Admin who is NOT the original permit requester.
8. **Illegal State Transitions**: Any invalid pair $(S, A)$ is rejected with 409 `ILLEGAL_TRANSITION` and returns `allowedActions`.

---

## 5. Role & Four-Eyes Principle Verification

| Test Scenario | Actor | Action | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| Self-Approval | Requester (Rajesh) | `POST /:id/approve` | 403 `SELF_APPROVAL_FORBIDDEN` | 403 `SELF_APPROVAL_FORBIDDEN` | **PASS** |
| Safety Officer Self-Approval | Safety Officer who created permit | `POST /:id/approve` | 403 `SELF_APPROVAL_FORBIDDEN` | 403 `SELF_APPROVAL_FORBIDDEN` | **PASS** |
| Wrong Area Approval | Area Owner (Suresh) | Approve Area 2 permit | 403 `WRONG_AREA` | 403 `WRONG_AREA` | **PASS** |
| Separation of Duties | Approver A | Approve Tier 2 after Tier 1 | 403 `DUTIES_SEPARATION_VIOLATION` | 403 `DUTIES_SEPARATION_VIOLATION` | **PASS** |
| Non-Owner Close | Requester B | Close Requester A's permit | 403 `NOT_PERMIT_OWNER` | 403 `NOT_PERMIT_OWNER` | **PASS** |
| Unauthorized Verify | Requester | `POST /:id/verify` | 403 `ROLE_NOT_ALLOWED` | 403 `ROLE_NOT_ALLOWED` | **PASS** |
| Dual-Tier Sign-off | Area Owner + Safety Officer | Sequential approvals | Remains `PENDING_APPROVAL` after Tier 1; transitions to `APPROVED` after Tier 2 | Transitions as specified | **PASS** |

---

## 6. Data & Audit Integrity Verification

1. **Immutable Audit Trail Trigger**:
   - PostgreSQL row-level trigger `trg_prevent_audit_log_modification` blocks all `UPDATE` and `DELETE` queries against `audit_log`, even if executed by table owners.
2. **Comprehensive Audit Action Coverage**:
   - Every lifecycle transition writes an immutable audit record capturing `actor_id`, `action`, `from_value`, `to_value`, `comment`, and `created_at`.
   - Modifying a permit in `PENDING_APPROVAL` resets approval rows and logs an `approvals_reset` audit record (D-021).
   - Each individual edited field is recorded with its previous and new value.
3. **Automated System Expiry Attribution**:
   - Automated sweeper and lazy expiry events record `actor_id: NULL` with comment `"Automated lazy expiry: planned_end window elapsed"` (D-018), rendered cleanly as "SYSTEM" in the UI.
4. **Equipment Consistency (D-025)**:
   - Creating/updating drafts without equipment succeeds (`equipment_id: null`).
   - Submitting without equipment returns HTTP 422 `"Select equipment from the chosen area"`.
   - Submitting with mismatched equipment returns HTTP 422 `"Select equipment from the chosen area"`.

---

## 7. Live Interactive Browser Verification Report

The full browser walkthrough was conducted using Google Chrome driving the live frontend (`http://localhost:3000`) and API (`http://localhost:4000`).

**Created Permit**: `PTW-2026-0019`  
**Permit UUID**: `4452f8b3-381a-40a2-b13a-16c37d34efcb`  
**Full Video Recordings**: [recording.mp4](file:///d:/task/docs/screenshots/recording.mp4), [recording_2.mp4](file:///d:/task/docs/screenshots/recording_2.mp4), [recording_3.mp4](file:///d:/task/docs/screenshots/recording_3.mp4)

### Visual Screenshot Evidence Table

| Step | Milestone | Screenshot | Verification Highlights |
|---|---|---|---|
| **01** | Login Page | [01_login_page.png](file:///d:/task/docs/screenshots/01_login_page.png) | System branding, 4 quick-demo role login buttons. |
| **02** | Dashboard | [02_dashboard.png](file:///d:/task/docs/screenshots/02_dashboard.png) | Real-time KPI metrics, active countdowns, pending approvals. |
| **03** | Wizard Step 1: Types | [03_create_step1_types.png](file:///d:/task/docs/screenshots/03_create_step1_types.png) | Hot Work, Confined Space, Height, LOTO all present. |
| **04** | Confined Space Dynamic | [04_dynamic_fields_confined_space.png](file:///d:/task/docs/screenshots/04_dynamic_fields_confined_space.png) | O2, LEL, H2S, CO gas calibration, attendant, rescue plan. |
| **05** | Height Dynamic | [05_dynamic_fields_height.png](file:///d:/task/docs/screenshots/05_dynamic_fields_height.png) | Height in meters, access method, anchor point verification. |
| **06** | LOTO Dynamic | [06_dynamic_fields_loto.png](file:///d:/task/docs/screenshots/06_dynamic_fields_loto.png) | Isolation points, padlock list, warning tags, earthing. |
| **07** | Draft Created | [07_permit_draft_created.png](file:///d:/task/docs/screenshots/07_permit_draft_created.png) | PTW-2026-0019 saved in `DRAFT` status; Edit Draft button visible. |
| **08** | Pending Approval | [08_permit_pending_approval.png](file:///d:/task/docs/screenshots/08_permit_pending_approval.png) | Transitioned to `PENDING_APPROVAL`; 2 approval tiers generated. |
| **09** | Area Owner Approval | [09_area_owner_approved.png](file:///d:/task/docs/screenshots/09_area_owner_approved.png) | Suresh Raman approves Area tier; status remains PENDING_APPROVAL. |
| **10** | Safety Officer Approval | [10_safety_officer_approved.png](file:///d:/task/docs/screenshots/10_safety_officer_approved.png) | Priya Nair approves Safety tier; status transitions to `APPROVED`. |
| **11** | Permit Activated | [11_permit_activated.png](file:///d:/task/docs/screenshots/11_permit_activated.png) | Rajesh Kumar activates permit; status `ACTIVE`, live countdown timer runs. |
| **12** | Permit Suspended | [12_permit_suspended.png](file:///d:/task/docs/screenshots/12_permit_suspended.png) | Safety Officer suspends work ("Emergency drill in progress"). |
| **13** | Permit Resumed | [13_permit_resumed.png](file:///d:/task/docs/screenshots/13_permit_resumed.png) | Safety Officer resumes work; status cleanly returns to `ACTIVE`. |
| **14** | Permit Closed | [14_permit_closed.png](file:///d:/task/docs/screenshots/14_permit_closed.png) | Requester marks work complete with required completion notes. |
| **15** | Closed (Verified) | [15_permit_closed_verified.png](file:///d:/task/docs/screenshots/15_permit_closed_verified.png) | Safety Officer verifies closure; final terminal status reached. |
| **16** | Full Audit Timeline | [16_audit_timeline.png](file:///d:/task/docs/screenshots/16_audit_timeline.png) | 9 sequential immutable audit events with actors, timestamps, and comments. |

---

## 8. Production Readiness & Security Audit

1. **Decoupled Migrations (D-026)**:
   - `server.ts` does not execute `runMigrations()` on startup.
   - Migrations are decoupled as an explicit pre-deploy step using `ADMIN_DATABASE_URL` (e.g. Render `preDeployCommand: npm run db:migrate`).
   - The running API service connects strictly via `DATABASE_URL` using `ptw_app_user` with restricted DML privileges (no DDL).
2. **Production Secret Enforcement (Stage 6 Reconciliation)**:
   - `SWEEP_SECRET` must be explicitly configured in production (minimum 32 characters).
   - Rejects unedited placeholders (`YOUR_PRODUCTION_SWEEP_SECRET`, `CHANGE_ME`, or development fallback `KNOWN_DEV_SWEEP_SECRET`).
   - Constant-time comparison (`crypto.timingSafeEqual`) prevents timing side-channel attacks on `/internal/sweep`.
3. **Session Cookies & CORS**:
   - `httpOnly: true`, `sameSite: 'lax'`, `secure: true` in production environments.
   - CORS origin strictly bound to `CORS_ORIGIN`.
4. **Health Check & Process Signals**:
   - `GET /health` returns 200 OK with ISO timestamp.
   - `SIGTERM` and `SIGINT` trigger graceful shutdown: stops sweeper, drains in-flight sweeps, closes PostgreSQL pool, and terminates with code 0.

---

## 9. Automated Test Verification Summary

```text
================================================================================
FINAL VERIFICATION TEST RUNNER SUMMARY
================================================================================
Workspace @ptw/shared :  1 test file  |   6 passed (6)   | 0 failed
Workspace @ptw/api    : 12 test files | 226 passed (226) | 0 failed
Workspace @ptw/web    :  7 test files |  32 passed (32)  | 0 failed
--------------------------------------------------------------------------------
TOTAL SUITES          : 20 test files | 264 passed (264) | 0 failed (100% GREEN)
================================================================================
```

---

## 10. Deployment Readiness Decision

### Recommendation: **PROCEED TO DEPLOYMENT**

All technical, domain, and security requirements of the OPMAINT Permit to Work CMMS specification are satisfied:
1. No blocking defects remain.
2. All 4 required permit types are implemented end-to-end.
3. Strict state-machine transitions and four-eyes authorization rules are server-authoritative.
4. Database migrations and credentials follow production security isolation standards.
5. Interactive browser verification is complete with full photo and video evidence.
