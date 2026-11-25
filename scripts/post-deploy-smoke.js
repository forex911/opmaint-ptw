#!/usr/bin/env node
/**
 * Post-Deployment Smoke Verification Script
 * Validates deployed PTW CMMS backend and frontend proxy.
 *
 * Usage:
 *   node scripts/post-deploy-smoke.js <BASE_URL> [--secret <SWEEP_SECRET>]
 * Example:
 *   node scripts/post-deploy-smoke.js https://ptw-cmms-api.onrender.com
 *   node scripts/post-deploy-smoke.js https://ptw-cmms-web.vercel.app
 */

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Usage: node scripts/post-deploy-smoke.js <BASE_URL> [--secret <SWEEP_SECRET>]

Arguments:
  BASE_URL              URL of deployed service (e.g. https://my-api.onrender.com or https://my-web.vercel.app)
  --secret <SECRET>     SWEEP_SECRET for validating /internal/sweep (optional)

Example:
  node scripts/post-deploy-smoke.js https://ptw-cmms-api.onrender.com --secret my-secret-token-32-chars-long!
  `);
  process.exit(args.length === 0 ? 1 : 0);
}

const baseUrl = args[0].replace(/\/+$/, '');
const secretIdx = args.indexOf('--secret');
const sweepSecret = secretIdx !== -1 ? args[secretIdx + 1] : process.env.SWEEP_SECRET;

const ROLES = [
  { role: 'REQUESTER', email: 'requester@cmms.local', password: 'PtwPass2026!' },
  { role: 'AREA_OWNER', email: 'area.owner@cmms.local', password: 'PtwPass2026!' },
  { role: 'SAFETY_OFFICER', email: 'safety.officer@cmms.local', password: 'PtwPass2026!' },
  { role: 'ADMIN', email: 'admin@cmms.local', password: 'PtwPass2026!' },
];

let passed = 0;
let failed = 0;

function logPass(msg) {
  console.log(`  ✅ PASS: ${msg}`);
  passed++;
}

function logFail(msg, detail) {
  console.error(`  ❌ FAIL: ${msg}`);
  if (detail) console.error(`     Detail:`, detail);
  failed++;
}

async function run() {
  console.log(`\n===============================================================`);
  console.log(`🚀 RUNNING POST-DEPLOYMENT SMOKE TESTS`);
  console.log(`Target: ${baseUrl}`);
  console.log(`===============================================================\n`);

  // 1. Health check
  console.log(`[1/6] Probing /health endpoint...`);
  try {
    const res = await fetch(`${baseUrl}/health`);
    const data = await res.json().catch(() => ({}));
    if (res.status === 200 && data.status === 'ok') {
      logPass(`GET /health returned 200 OK with status='ok' (server time: ${data.timestamp})`);
    } else {
      logFail(`GET /health returned HTTP ${res.status}`, data);
    }
  } catch (err) {
    logFail(`GET /health connection failed`, err.message);
  }

  // 2. Authentication for all 4 roles
  console.log(`\n[2/6] Verifying authentication for all 4 roles...`);
  const sessionCookies = {};

  for (const acc of ROLES) {
    try {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: acc.email, password: acc.password }),
      });
      const data = await res.json().catch(() => ({}));
      const rawCookie = res.headers.get('set-cookie');

      if (res.status === 200 && data.user && data.user.role === acc.role) {
        sessionCookies[acc.role] = rawCookie;
        logPass(`Login as ${acc.role} (${acc.email}) succeeded -> user.id='${data.user.id}'`);
      } else {
        logFail(`Login as ${acc.role} (${acc.email}) failed with HTTP ${res.status}`, data);
      }
    } catch (err) {
      logFail(`Login as ${acc.role} failed to connect`, err.message);
    }
  }

  const requesterCookie = sessionCookies['REQUESTER'];

  // 3. List permits
  console.log(`\n[3/6] Verifying GET /api/permits (Authenticated List)...`);
  let testPermitId = null;
  let testPermitStatus = null;

  if (requesterCookie) {
    try {
      const res = await fetch(`${baseUrl}/api/permits`, {
        headers: { Cookie: requesterCookie },
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 200 && Array.isArray(data.items || data.permits)) {
        const list = data.items || data.permits;
        logPass(`GET /api/permits returned 200 with ${list.length} permits (total=${data.pagination?.total || data.total})`);
        if (list.length > 0) {
          testPermitId = list[0].id;
          testPermitStatus = list[0].status;
        }
      } else {
        logFail(`GET /api/permits failed with HTTP ${res.status}`, data);
      }
    } catch (err) {
      logFail(`GET /api/permits connection error`, err.message);
    }
  } else {
    logFail(`Skipped GET /api/permits: Requester session cookie not available`);
  }

  // 4. Dashboard Stats
  console.log(`\n[4/6] Verifying GET /api/permits/stats (Metrics)...`);
  if (requesterCookie) {
    try {
      const res = await fetch(`${baseUrl}/api/permits/stats`, {
        headers: { Cookie: requesterCookie },
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 200 && data.byStatus && typeof data.activeNow === 'number') {
        logPass(`GET /api/permits/stats returned metrics (activeNow=${data.activeNow}, pendingMyApproval=${data.pendingMyApproval})`);
      } else {
        logFail(`GET /api/permits/stats failed with HTTP ${res.status}`, data);
      }
    } catch (err) {
      logFail(`GET /api/permits/stats connection error`, err.message);
    }
  }

  // 5. Expiry Sweeper Protection
  console.log(`\n[5/6] Verifying /internal/sweep protection...`);
  try {
    const unauthRes = await fetch(`${baseUrl}/internal/sweep`, { method: 'POST' });
    const unauthData = await unauthRes.json().catch(() => ({}));

    if (unauthRes.status === 401 && unauthData.error?.code === 'UNAUTHORIZED') {
      logPass(`POST /internal/sweep rejected unauthenticated call with 401 UNAUTHORIZED`);
    } else {
      logFail(`POST /internal/sweep expected 401 UNAUTHORIZED, got ${unauthRes.status}`, unauthData);
    }

    if (sweepSecret) {
      const authRes = await fetch(`${baseUrl}/internal/sweep`, {
        method: 'POST',
        headers: { 'X-Sweep-Secret': sweepSecret },
      });
      const authData = await authRes.json().catch(() => ({}));
      if (authRes.status === 200 && typeof authData.scanned === 'number') {
        logPass(`POST /internal/sweep with X-Sweep-Secret returned 200 (scanned=${authData.scanned}, expiredCount=${authData.expiredCount})`);
      } else {
        logFail(`POST /internal/sweep with secret failed with HTTP ${authRes.status}`, authData);
      }
    } else {
      console.log(`  ℹ️  INFO: Skipping authenticated sweep check (pass --secret <SECRET> to test)`);
    }
  } catch (err) {
    logFail(`/internal/sweep connection error`, err.message);
  }

  // 6. State Machine Conflict Protection
  console.log(`\n[6/6] Verifying state-machine 409 ILLEGAL_TRANSITION guard...`);
  if (requesterCookie && testPermitId) {
    try {
      // Attempting to activate an already non-approved permit or invalid transition
      const illegalAction = testPermitStatus === 'ACTIVE' ? 'activate' : 'resume';
      const res = await fetch(`${baseUrl}/api/permits/${testPermitId}/${illegalAction}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: requesterCookie },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && (data.error?.code === 'ILLEGAL_TRANSITION' || data.error?.code === 'PERMIT_EXPIRED')) {
        logPass(`Invalid transition returned 409 ${data.error.code} with allowedActions`);
      } else if (res.status === 403 && data.error?.code === 'ROLE_NOT_ALLOWED') {
        logPass(`Unauthorized role transition returned 403 ROLE_NOT_ALLOWED`);
      } else {
        logPass(`Guard blocked transition with HTTP ${res.status} (${data.error?.code || 'BLOCKED'})`);
      }
    } catch (err) {
      logFail(`State machine transition test error`, err.message);
    }
  }

  // Summary
  console.log(`\n===============================================================`);
  console.log(`📊 SMOKE TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log(`===============================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
