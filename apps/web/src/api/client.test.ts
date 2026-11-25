import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from './client.js';

describe('Web API Client Contract & Normalization Suite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('normalizes backend items and pagination into permits array, total, and pages', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          { id: 'p1', permitNo: 'PTW-2026-0001', status: 'ACTIVE' },
          { id: 'p2', permitNo: 'PTW-2026-0002', status: 'PENDING_APPROVAL' },
        ],
        pagination: {
          total: 42,
          page: 2,
          limit: 10,
          totalPages: 5,
        },
      }),
    });

    const res = await api.getPermits({ page: 2, limit: 10, sortDir: 'desc' });

    expect(res.permits).toHaveLength(2);
    expect(res.permits[0].permitNo).toBe('PTW-2026-0001');
    expect(res.total).toBe(42);
    expect(res.page).toBe(2);
    expect(res.limit).toBe(10);
    expect(res.pages).toBe(5);
  });

  it('returns backend dashboard statistics directly in camelCase', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        total: 22,
        byStatus: {
          DRAFT: 2,
          PENDING_APPROVAL: 3,
          APPROVED: 1,
          ACTIVE: 4,
          SUSPENDED: 1,
          REJECTED: 0,
          EXPIRED: 2,
          CLOSED: 3,
          CLOSED_VERIFIED: 5,
          CANCELLED: 1,
        },
        activeNow: 4,
        expiringIn2h: 2,
        pendingMyApproval: 3,
      }),
    });

    const stats = await api.getDashboardStats();

    expect(stats.total).toBe(22);
    expect(stats.activeNow).toBe(4);
    expect(stats.expiringIn2h).toBe(2);
    expect(stats.pendingMyApproval).toBe(3);
  });

  it('calls dedicated audit endpoint GET /api/permits/:id/audit', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          timeline: [
            { id: 'a1', action: 'create', fromValue: null, toValue: 'DRAFT', actorName: 'Requester' },
            { id: 'a2', action: 'submit', fromValue: 'DRAFT', toValue: 'PENDING_APPROVAL', actorName: 'Requester' },
          ],
        }),
      };
    });

    const audit = await api.getAuditTimeline('test-permit-123');
    expect(capturedUrl).toBe('/api/permits/test-permit-123/audit');
    expect(audit.timeline).toHaveLength(2);
    expect(audit.timeline[1].action).toBe('submit');
  });

  it('formats work log payload with kind and note', async () => {
    let capturedBody: any;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          workLog: { id: 'wl-1', kind: capturedBody.kind, note: capturedBody.note },
        }),
      };
    });

    await api.addWorkLog('p-1', { kind: 'ENTRY', note: 'Technician entered vessel' });
    expect(capturedBody).toEqual({ kind: 'ENTRY', note: 'Technician entered vessel' });
  });

  it('passes completionNotes in camelCase when closing permit', async () => {
    let capturedBody: any;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          permit: { id: 'p-1', status: 'CLOSED' },
        }),
      };
    });

    await api.closePermit('p-1', { completionNotes: 'Work finished cleanly' });
    expect(capturedBody.completionNotes).toBe('Work finished cleanly');
  });

  it('calls POST /api/permits/:id/verify for closure verification', async () => {
    let capturedUrl = '';
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          permit: { id: 'p-1', status: 'CLOSED_VERIFIED' },
        }),
      };
    });

    await api.verifyPermit('p-1', 'Site verified safe');
    expect(capturedUrl).toBe('/api/permits/p-1/verify');
  });
});
