# OPMAINT CMMS — STAGE 9: PRODUCTION DEPLOYMENT PLAN

**Date**: 2026-11-25  
**Author**: Senior DevOps Engineer & Industrial CMMS Specialist  
**Target Commit**: `cdc3ec2` (branch `main`)  
**Deployment Target**: Production Cloud Infrastructure (Vercel + Render + Neon PostgreSQL + GitHub)  

---

## 1. Executive Summary & Target Architecture

The OPMAINT Permit to Work (PTW) CMMS has passed all Stage 8C functional, lifecycle, and security verifications (264/264 passing tests, zero defects). Stage 9 governs the production preparation, hardening, and deployment across the distributed cloud architecture:

```
┌────────────────────────────────┐
│   Client Browser / Operator    │
└──────────────┬─────────────────┘
               │ HTTPS (Port 443)
               ▼
┌────────────────────────────────────────────────────────┐
│             Vercel Frontend Edge (SPA)                 │
│         Origin: https://<web-app>.vercel.app           │
│                                                        │
│  - Static Assets & Vite React 18 Bundle                │
│  - SPA Fallback Route: /(.*) -> /index.html            │
│  - Edge Reverse Proxy:                                 │
│      /api/*      -> https://<api-service>.onrender.com │
│      /health     -> https://<api-service>.onrender.com │
│      /internal/* -> https://<api-service>.onrender.com │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS Proxied Request (Same-Site Cookies)
                           ▼
┌────────────────────────────────────────────────────────┐
│             Render Web Service (API)                   │
│         Origin: https://<api-service>.onrender.com     │
│                                                        │
│  - Runtime: Node.js 20+ Native Web Service             │
│  - Pre-Deploy Hook: npm run db:migrate (D-026)         │
│  - Start Command: node apps/api/dist/index.js          │
│  - Background Sweeper: 1-minute cron (D-008)          │
│  - Graceful Shutdown: SIGTERM/SIGINT pool draining     │
└──────────────┬──────────────────────────┬──────────────┘
               │ DATABASE_URL             │ ADMIN_DATABASE_URL
               │ (ptw_app_user - DML)     │ (neondb_owner - DDL)
               ▼                          ▼
┌────────────────────────────────────────────────────────┐
│             Neon Serverless PostgreSQL 16+             │
│                                                        │
│  - Connection Pooling: pgbouncer (-pooler endpoint)    │
│  - Direct Endpoint: DDL migrations (Advisory lock)     │
│  - Immutability Triggers: Append-only audit_log        │
│  - Sequence: ptw_permit_no_seq                         │
└────────────────────────────────────────────────────────┘
```

---

## 2. Pre-Deployment Audit Findings

Every component required by the Stage 9 audit specification was inspected directly in the repository:

| Component | Target File | Audit Status | Key Finding |
|---|---|---|---|
| **Root Package & Workspaces** | [`package.json`](file:///d:/task/package.json) | **PASS** | npm workspaces (`packages/*`, `apps/*`). Build, typecheck, lint, and test scripts verified clean. |
| **Backend Package** | [`apps/api/package.json`](file:///d:/task/apps/api/package.json) | **PASS** | Dependencies complete. ESM `"type": "module"`. `"main": "./dist/index.js"`. |
| **Frontend Package** | [`apps/web/package.json`](file:///d:/task/apps/web/package.json) | **PASS** | Vite React 18 build verified. Bundle size: 399 kB JS, 32 kB CSS. |
| **Shared Domain** | [`packages/shared/package.json`](file:///d:/task/packages/shared/package.json) | **PASS** | Builds to `dist/index.js` and `dist/index.d.ts`. Zero external network deps. |
| **Docker Configuration** | [`docker-compose.yml`](file:///d:/task/docker-compose.yml) | **PASS** | Local Postgres 16 container for development. Production uses Render native Node runtime. |
| **Drizzle & Migrations** | [`apps/api/src/db/migrations/`](file:///d:/task/apps/api/src/db/migrations/) | **PASS** | 3 idempotent SQL migrations (`0000_initial_schema.sql`, `0001_permit_type_check.sql`, `0002_permit_equipment_nullable.sql`). |
| **Migration Runner** | [`apps/api/src/db/migrate.ts`](file:///d:/task/apps/api/src/db/migrate.ts) | **PASS** | Dedicated `_migrations` tracking table. Connects via `ADMIN_DATABASE_URL` (or falls back to pool). |
| **Database Seeder** | [`apps/api/src/db/seed.ts`](file:///d:/task/apps/api/src/db/seed.ts) | **PASS** | Non-destructive idempotent upsert for 4 users, 2 plants, 3 areas, 6 equipment, 10 permits. |
| **Environment Validation** | [`apps/api/src/config/env.ts`](file:///d:/task/apps/api/src/config/env.ts) | **PASS** | Strict Zod schema. Enforces 32-char min on `JWT_SECRET` and `SWEEP_SECRET`. Rejects placeholders in production. |
| **Health Endpoint** | `GET /health` in [`app.ts`](file:///d:/task/apps/api/src/app.ts) | **PASS** | Responds with 200 OK and ISO timestamp without unnecessary database load. |
| **CORS Configuration** | [`apps/api/src/app.ts`](file:///d:/task/apps/api/src/app.ts) | **PASS** | Restricted origin with `credentials: true`. Supports Vercel origin. |
| **Cookie & Sessions** | [`apps/api/src/utils/jwt.ts`](file:///d:/task/apps/api/src/utils/jwt.ts) | **PASS** | `httpOnly: true`, `secure: true` in production, `sameSite: 'lax'`, 8-hour lifetime. |
| **Background Sweeper** | [`expiry-sweeper.ts`](file:///d:/task/apps/api/src/modules/permits/sweeper/expiry-sweeper.ts) | **PASS** | Single-instance in-process cron + protected `/internal/sweep` endpoint with constant-time secret check. |
| **Vercel Routing** | [`vercel.json`](file:///d:/task/vercel.json) | **PASS** | Proxies `/api/*`, `/health`, and `/internal/*` to Render; routes SPA traffic to `/index.html`. |
| **Render Infrastructure** | [`render.yaml`](file:///d:/task/render.yaml) | **ACTION REQUIRED** | Start command and pre-deploy command require remediation (see Section 3). |

---

## 3. Deployment Blockers Identified & Remediation Plan

Our deep inspection uncovered **3 critical configuration issues** that must be resolved prior to deploying:

### Blocker 1: Incorrect Start Command in `render.yaml` and `README.md`
- **Issue**: `render.yaml` (line 9) and `README.md` (line 182) specify:
  ```yaml
  startCommand: node apps/api/dist/server.js
  ```
- **Root Cause**: `apps/api/dist/server.js` only exports `startServer()` — it does NOT execute it. Running `node apps/api/dist/server.js` immediately terminates with exit code 0, causing the Render container to crash in a restart loop. The executable entry point is `apps/api/dist/index.js`.
- **Remediation**: Update `render.yaml` and `README.md` to:
  ```yaml
  startCommand: node apps/api/dist/index.js
  ```

### Blocker 2: Missing `preDeployCommand` in `render.yaml`
- **Issue**: `render.yaml` does not declare a `preDeployCommand`.
- **Root Cause**: Decision **D-026** intentionally decoupled `runMigrations()` from runtime server startup (`server.ts`). Without a `preDeployCommand` in `render.yaml`, Render will deploy the API without running database migrations, causing runtime queries to fail on missing tables or columns.
- **Remediation**: Add the following to `render.yaml`:
  ```yaml
  preDeployCommand: npm run db:migrate
  ```

### Blocker 3: Missing `ADMIN_DATABASE_URL` in `render.yaml` envVars
- **Issue**: `render.yaml` declares `DATABASE_URL`, but omits `ADMIN_DATABASE_URL`.
- **Root Cause**: `npm run db:migrate` requires administrative DDL privileges to execute migrations, create sequences, and establish triggers. The runtime API connects via the restricted `ptw_app_user`.
- **Remediation**: Add `ADMIN_DATABASE_URL` with `sync: false` to `render.yaml` environment variables.

---

## 4. Database Setup & Neon Provisioning Strategy

### 4.1 Connection Topology
Neon provides two distinct connection strings:
1. **Direct Connection String** (`*.neon.tech` on port 5432):
   - Supports native DDL, schema migrations, and advisory locking.
   - Assigned to `ADMIN_DATABASE_URL`.
2. **Pooled Connection String** (`*-pooler.neon.tech` on port 5432 via PgBouncer in transaction mode):
   - Optimized for high-concurrency serverless query execution.
   - Assigned to `DATABASE_URL` for the runtime API service.

### 4.2 Principle of Least Privilege (Role Separation)
In accordance with industrial CMMS security standards:
- **`ADMIN_DATABASE_URL`**: Connects as database owner (`neondb_owner`) with full DDL rights. Used exclusively by `npm run db:migrate` during pre-deploy.
- **`DATABASE_URL`**: Connects as restricted runtime user `ptw_app_user`:
  ```sql
  CREATE ROLE ptw_app_user WITH LOGIN PASSWORD '<secure-app-password>';
  GRANT USAGE ON SCHEMA public TO ptw_app_user;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ptw_app_user;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ptw_app_user;
  REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM ptw_app_user;
  ```
- **Audit Immutability**: The PostgreSQL trigger `trg_audit_log_immutable` guarantees that neither role can modify or delete existing audit events.

### 4.3 Migration & Seeding Execution Order
1. Run migrations once via Neon direct connection:
   ```bash
   DATABASE_URL="<NEON_DIRECT_URL>" npm run db:migrate:remote
   ```
2. Verify migration tracking table: `SELECT * FROM _migrations;` (must contain 3 records).
3. Seed demo accounts and initial plant hierarchy only when setting up reviewer environments:
   ```bash
   DATABASE_URL="<NEON_DIRECT_URL>" npm run db:seed:remote
   ```
4. Production releases must **never** run `db:seed` automatically in pre-deploy hooks.

---

## 5. Backend Deployment Strategy (Render)

### 5.1 Service Configuration
- **Type**: Web Service (`runtime: node`)
- **Plan**: Free / Starter
- **Region**: Oregon (`us-west`) or Frankfurt (`eu-central`) matching Neon database region.
- **Build Command**:
  ```bash
  npm ci && npm run --workspace=@ptw/shared build && npm run --workspace=@ptw/api build
  ```
- **Pre-Deploy Command**:
  ```bash
  npm run db:migrate
  ```
- **Start Command**:
  ```bash
  node apps/api/dist/index.js
  ```
- **Health Check Path**: `/health`

### 5.2 Environment Variables (Render)
All production secrets must be generated with cryptographically secure random bytes:

| Variable | Generation / Value | Security Rationale |
|---|---|---|
| `NODE_ENV` | `production` | Enables secure cookies, strict Zod validation, and error redaction. |
| `PORT` | `10000` | Render standard port. |
| `DATABASE_URL` | Neon pooled connection string | Restricted runtime DML user (`ptw_app_user`). |
| `ADMIN_DATABASE_URL` | Neon direct connection string | Pre-deploy migration execution only. |
| `JWT_SECRET` | `openssl rand -hex 32` | 256-bit entropy HMAC secret; never shared with client. |
| `COOKIE_SECRET` | `openssl rand -hex 32` | Signs cookie payloads to prevent tampering. |
| `SWEEP_SECRET` | `openssl rand -hex 32` | 256-bit secret protecting `/internal/sweep` webhook. |
| `CORS_ORIGIN` | `https://<VERCEL-APP>.vercel.app` | Restricts cross-origin resource access. |
| `TRUST_PROXY` | `true` | Allows Express to inspect `X-Forwarded-For` from reverse proxy. |

---

## 6. Frontend Deployment Strategy (Vercel)

### 6.1 Reverse-Proxy Topology (Same-Site Authentication)
To avoid browser third-party cookie blocking (Apple Safari ITP, Google Privacy Sandbox), the Vercel frontend acts as a unified reverse proxy:
1. The browser visits `https://<web-app>.vercel.app`.
2. All API calls use relative URLs (e.g. `/api/auth/login`, `/api/permits`).
3. Vercel edge rewrites proxy these requests directly to the Render backend over HTTPS:
   ```json
   {
     "source": "/api/:path*",
     "destination": "https://<RENDER-API>.onrender.com/api/:path*"
   }
   ```
4. The authentication cookie `ptw_token` is set with `SameSite=Lax; Secure; HttpOnly` on the `<web-app>.vercel.app` domain.
5. Result: **100% first-party cookies without cross-domain iframe or CORS issues**.

### 6.2 SPA Fallback & Static Assets
- `/(.*) -> /index.html` ensures client-side routing (`react-router-dom`) functions seamlessly on page refreshes and direct URL links.
- Static assets (`/assets/*`) are cached immutably with content hashing.

---

## 7. Production Security & Invariant Checklist

- [x] **Zero Code Secrets in Git**: No credentials, passwords, or production tokens committed.
- [x] **Timing Attack Defense**: Pre-computed bcrypt dummy hash for non-existent users in `auth.service.ts`.
- [x] **Timing-Safe Cron Secret**: `crypto.timingSafeEqual` in `/internal/sweep`.
- [x] **Pessimistic Locking**: `SELECT ... FOR UPDATE` serializes concurrent permit transitions.
- [x] **Row-Level Immutability**: PostgreSQL trigger blocks `UPDATE` and `DELETE` on `audit_log`.
- [x] **Rate Limiting**: IP + Email failed login throttle (10 attempts per 15 min).
- [x] **Error Sanitization**: Error envelopes never expose database stack traces in production (`AppError` envelope).
- [x] **Automated Sweeper Idempotency**: `isSweeping` lock prevents overlapping executions.

---

## 8. Verification & Smoke Test Protocol

Following deployment, the verification protocol executes the 11 mandatory checks:

```bash
node scripts/post-deploy-smoke.js https://<VERCEL-APP>.vercel.app --secret <SWEEP_SECRET>
```

| Step | Target Check | Expected Result |
|---|---|---|
| **1** | `GET /health` | HTTP 200 OK, `{"status":"ok","timestamp":"..."}` |
| **2** | `POST /api/auth/login` (Requester) | HTTP 200 OK, `Set-Cookie` with `ptw_token`, `role: REQUESTER` |
| **3** | `POST /api/auth/login` (Area Owner) | HTTP 200 OK, `role: AREA_OWNER` |
| **4** | `POST /api/auth/login` (Safety Officer) | HTTP 200 OK, `role: SAFETY_OFFICER` |
| **5** | `POST /api/auth/login` (Admin) | HTTP 200 OK, `role: ADMIN` |
| **6** | `GET /api/permits` | HTTP 200 OK, paginated list of permits |
| **7** | `GET /api/permits/stats` | HTTP 200 OK, active and status counts |
| **8** | `POST /internal/sweep` (no secret) | HTTP 401 UNAUTHORIZED |
| **9** | `POST /internal/sweep` (with secret) | HTTP 200 OK, `{"scanned": N, "expiredCount": N}` |
| **10** | State Machine Conflict Guard | HTTP 409 ILLEGAL_TRANSITION with `allowedActions` |
| **11** | Live Browser Interactive Verification | Full login, draft creation, submit, approval, and audit check in Chrome |

---

## 9. Rollback & Disaster Recovery Procedures

1. **Frontend Rollback**: Vercel Instant Rollback allows reverting to the previous deployment SHA with zero downtime.
2. **Backend Rollback**: Render allows selecting any previous successful deploy from the Events timeline.
3. **Database Rollback**:
   - Schema migrations are strictly forward-compatible and additive.
   - Point-in-Time Restore (PITR) in Neon allows branching or restoring the database to any millisecond within the retention window.

---

## 10. Next Immediate Steps (Awaiting User Review)

Before provisioning resources or making remote modifications:
1. **Apply Configuration Fixes**:
   - Update `render.yaml` with `node apps/api/dist/index.js`, `preDeployCommand: npm run db:migrate`, and `ADMIN_DATABASE_URL`.
   - Update `README.md` to reflect the corrected start command.
2. **Review Deployment Credentials**:
   - Confirm Neon project setup and retrieve connection strings (`DATABASE_URL` and `ADMIN_DATABASE_URL`).
   - Confirm Render web service name and Vercel project name to align reverse-proxy destinations.
