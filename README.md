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
- Docker & Docker Compose (PostgreSQL 16) or local PostgreSQL 16+

### Setup Steps (Windows and Linux)
Commands are written as individual steps without shell-specific chaining:

```bash
# 1. Start local PostgreSQL via Docker Compose
docker compose up -d

# 2. Install workspace dependencies
npm ci

# 3. Run typecheck and lint
npm run typecheck
npm run lint

# 4. Run database migrations
npm run db:migrate

# 5. Seed the database with demo data
npm run db:seed

# 6. Build all workspace packages
npm run build

# 7. Run full test suite
npm run test
```

### Production Database & Role Provisioning
In production and managed PostgreSQL environments (such as AWS RDS, GCP Cloud SQL, Supabase, Neon), executing database users may not have `CREATEROLE` permissions. In those environments, the initial migration gracefully catches `insufficient_privilege` and skips automatic role creation. The DBA should provision the restricted application role and password out-of-band:

```sql
-- Executed by Database Administrator (DBA)
CREATE ROLE ptw_app_user WITH LOGIN PASSWORD 'your-secure-app-password';
GRANT USAGE ON SCHEMA public TO ptw_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ptw_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ptw_app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM ptw_app_user;
```

Then configure the application environment:
- `DATABASE_URL`: `postgres://ptw_app_user:your-secure-app-password@<db-host>:5432/ptw_cmms` (used by the running API).
- `ADMIN_DATABASE_URL`: `postgres://postgres:<admin-password>@<db-host>:5432/ptw_cmms` (used for `npm run db:migrate` and `db:seed`).
- Optional: Supply `APP_DB_PASSWORD` during migration execution if the migration connection holds `ALTER ROLE` permissions.

### Git Hooks & Sandbox Execution Note
Git hooks for pre-commit (`typecheck` + `lint`) and pre-push (`test`) are automatically installed into `.git/hooks/` during `npm ci` / `npm run prepare`. On Windows execution environments where msys `sh.exe` encounters local sandbox restrictions, all verification commands (`npm run typecheck`, `npm run lint`, `npm test`) are executed explicitly prior to committing.

### Remote Push Commands
When a remote repository is configured, push branches and tags using:
```bash
git push origin main --tags
git push origin stage/01-skeleton
git push origin stage/01b-cleanup
git push origin stage/02-schema
```
*(If no remote exists, operations remain safely recorded in local git history).*

---

## 3. Demo Credentials (Seeded by `npm run db:seed`)

| Role | Name | Email | Password | Responsibility |
|---|---|---|---|---|
| `REQUESTER` | Rajesh Kumar | `requester@cmms.local` | `PtwPass2026!` | Drafts permits, coordinates contractor teams, closes work |
| `AREA_OWNER` | Suresh Raman | `area.owner@cmms.local` | `PtwPass2026!` | Authorizes permits located in their assigned plant area |
| `SAFETY_OFFICER` | Priya Nair | `safety.officer@cmms.local` | `PtwPass2026!` | Plant-wide safety review, suspensions, closures, verification |
| `ADMIN` | Admin User | `admin@cmms.local` | `PtwPass2026!` | Plant/area/equipment configuration, emergency overrides |

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
- **D-011 (Permit Sequence Numbering)**: Atomic sequential generation via PostgreSQL sequence `ptw_permit_no_seq`.
- **D-012 (Append-Only Audit Immutability)**: Unconditional row-level database trigger on `audit_log`.
- **D-013 (Permit Approvals Model)**: Normalized `permit_approvals` table with role requirements and user assignments.

---

## 5. Known Limitations & Deferred Scope

See [docs/KNOWN_ISSUES.md](file:///D:/task/docs/KNOWN_ISSUES.md) for detailed descriptions.
- Authentication, role middleware, and session cookies are implemented in **Stage 3**.
- State machine transition engine is implemented in **Stage 4**.
- Permit CRUD, stats, work logs, and audit endpoints are implemented in **Stage 5**.
- Expiry sweeper is implemented in **Stage 6**.
- Extension requests and overlapping conflict detection are implemented in **Stage 7**.

---

## 6. AI Usage Transparency

See [docs/AI_USAGE.md](file:///D:/task/docs/AI_USAGE.md) for the full log of AI prompts, generated code, human reviews, and corrected build errors.

---

## 7. Production Deployment (Vercel + Render + Neon)

The PTW CMMS is prepared for cloud deployment using a decoupled 3-tier architecture:
- **Frontend SPA**: Hosted on **Vercel** with automatic route rewrites (`/api/*` reverse-proxied to Render backend, ensuring cookies are transmitted as first-party same-origin without third-party tracking restrictions).
- **Backend API**: Hosted on **Render** (Node.js Web Service) running `apps/api/dist/server.js`.
- **Database**: **Neon** (Serverless PostgreSQL 16+ with SSL connection pooling).

### Environment Variables

#### Backend API (`apps/api` on Render)
| Variable | Value / Description | Required | Example |
|---|---|---|---|
| `NODE_ENV` | `production` | Yes | `production` |
| `PORT` | Listening port (Render default: `10000`) | Yes | `10000` |
| `DATABASE_URL` | Neon pooled PostgreSQL connection string with SSL | Yes | `postgresql://user:pass@ep-xyz-pooler.neon.tech/neondb?sslmode=require` |
| `JWT_SECRET` | High-entropy random string (min 32 chars) | Yes | `openssl rand -hex 32` |
| `SWEEP_SECRET` | High-entropy random string (min 32 chars) for `/internal/sweep` | Yes | `openssl rand -hex 32` |
| `CORS_ORIGIN` | Deployed Vercel frontend origin | Yes | `https://ptw-cmms.vercel.app` |
| `COOKIE_SECURE` | Enforce HTTPS cookies in production | Yes | `true` |
| `COOKIE_SAME_SITE` | Cookie SameSite policy | Yes | `lax` |
| `TRUST_PROXY` | Trust reverse-proxy headers from Render/Vercel | Yes | `true` |

#### Frontend Web (`apps/web` on Vercel)
| Variable | Value / Description | Required |
|---|---|---|
| `VITE_API_URL` | Optional when using Vercel rewrites; defaults to `/api` | No |

---

### Step-by-Step Reviewer Deployment Checklist

#### Step 1: Provision Neon PostgreSQL
1. Sign in to [Neon Console](https://neon.tech) and create a project (e.g. `ptw-cmms-prod`).
2. Copy the **Pooled connection string** (ends with `-pooler.neon.tech/neondb?sslmode=require`).
3. Copy the **Direct connection string** (ends with `.neon.tech/neondb?sslmode=require`).

#### Step 2: Run Remote Migrations & Seed Data
From your local terminal with direct internet access to Neon:
```bash
# Set your Neon direct connection string and run migrations
DATABASE_URL="postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require" npm run db:migrate:remote

# Seed the required demo users, reference data, and 10 multi-status permits
DATABASE_URL="postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require" npm run db:seed:remote
```

#### Step 3: Deploy Backend API on Render
1. In [Render Dashboard](https://dashboard.render.com), click **New + > Web Service** and connect this repository.
2. Configure settings:
   - **Name**: `ptw-cmms-api`
   - **Runtime**: `Node`
   - **Build Command**: `npm ci && npm run --workspace=@ptw/shared build && npm run --workspace=@ptw/api build`
   - **Pre-Deploy Command**: `npm run db:migrate` (executes database migrations using `ADMIN_DATABASE_URL` before new instances start, per D-026)
   - **Start Command**: `node apps/api/dist/server.js`
   - **Health Check Path**: `/health`
3. Add environment variables:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: *(Neon pooled connection string for runtime app)*
   - `ADMIN_DATABASE_URL`: *(Neon direct connection string for pre-deploy migrations)*
   - `JWT_SECRET`: *(generate via `openssl rand -hex 32`)*
   - `SWEEP_SECRET`: *(generate via `openssl rand -hex 32`)*
   - `CORS_ORIGIN`: `https://<YOUR-APP>.vercel.app`
   - `COOKIE_SECURE`: `true`
   - `COOKIE_SAME_SITE`: `lax`
   - `TRUST_PROXY`: `true`
4. Deploy and verify `GET https://ptw-cmms-api.onrender.com/health` returns `200 OK` `{"status":"ok"}`.

#### Step 4: Deploy Frontend on Vercel
1. In [Vercel Dashboard](https://vercel.com/new), import the repository.
2. In `vercel.json` (or Project Settings), set the destination URL to point to your deployed Render URL:
   ```json
   "rewrites": [
     { "source": "/api/:path*", "destination": "https://<YOUR-RENDER-API>.onrender.com/api/:path*" },
     { "source": "/health", "destination": "https://<YOUR-RENDER-API>.onrender.com/health" },
     { "source": "/internal/:path*", "destination": "https://<YOUR-RENDER-API>.onrender.com/internal/:path*" },
     { "source": "/(.*)", "destination": "/index.html" }
   ]
   ```
3. Deploy. Because `/api/*` rewrites proxy requests server-side, cookies are first-party and work in all modern browsers without CORS warnings.

#### Step 5: External Cron Configuration (Free-Tier Health & Sweeper)
Free-tier hosting providers (like Render) sleep after 15 minutes of inactivity. Use a free external cron monitor (e.g. [cron-job.org](https://cron-job.org) or GitHub Actions):
1. **Render Keep-Warm Job**:
   - URL: `GET https://<YOUR-RENDER-API>.onrender.com/health`
   - Schedule: Every 10 minutes.
2. **Background Expiry Sweeper Trigger**:
   - URL: `POST https://<YOUR-RENDER-API>.onrender.com/internal/sweep`
   - Headers: `X-Sweep-Secret: <YOUR_SWEEP_SECRET>`
   - Schedule: Every 1 to 5 minutes.

---

### Post-Deployment Smoke Verification

Run the automated smoke test script against your live deployment:
```bash
node scripts/post-deploy-smoke.js https://<YOUR-APP>.vercel.app --secret <YOUR_SWEEP_SECRET>
```

The script verifies:
1. `GET /health` returns 200 OK with server timestamp.
2. All 4 demo roles (`requester`, `area.owner`, `safety.officer`, `admin`) authenticate successfully.
3. HttpOnly session cookies are transmitted and accepted.
4. `GET /api/permits` lists the seeded permits with pagination metadata.
5. `GET /api/permits/stats` returns live metric aggregations.
6. `POST /internal/sweep` rejects unauthorized callers with 401 UNAUTHORIZED and processes scans with valid secret.
7. State-machine guards return 409 ILLEGAL_TRANSITION when attempting invalid lifecycle actions.

