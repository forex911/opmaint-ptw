import type {
  User,
  Plant,
  Area,
  Equipment,
  Permit,
  PermitDetailResponse,
  PermitListQuery,
  PermitListResponse,
  DashboardStats,
  PermitWorkLog,
  AuditLogEntry,
} from '../types/index.js';

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: Record<string, unknown> | Array<{ path: string[]; message: string }>;
}

export class ApiError extends Error {
  public code: string;
  public status: number;
  public details?: unknown;

  constructor(status: number, error: ApiErrorDetail) {
    super(error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = error.code || 'UNKNOWN_ERROR';
    this.details = error.details;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = ((import.meta.env.VITE_API_URL as string | undefined) || '').replace(/\/+$/, '');
  const url = endpoint.startsWith('http') || !baseUrl ? endpoint : `${baseUrl}${endpoint}`;

  const config: RequestInit = {
    ...options,
    credentials: 'include', // Ensure HttpOnly cookies are transmitted
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  };

  const response = await fetch(url, config);

  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorPayload = data.error || {
      code: 'HTTP_' + response.status,
      message: data.message || response.statusText || 'Request failed',
      details: data.details,
    };
    throw new ApiError(response.status, errorPayload);
  }

  return data as T;
}

export const api = {
  // Auth
  login: (credentials: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  logout: () =>
    request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    }),

  getMe: () => request<{ user: User }>('/api/auth/me'),

  // Reference Data
  getPlants: () => request<{ plants: Plant[] }>('/api/plants'),

  getAreas: (plantId?: string) => {
    const query = plantId ? `?plantId=${encodeURIComponent(plantId)}` : '';
    return request<{ areas: Area[] }>(`/api/areas${query}`);
  },

  getEquipment: (areaId?: string) => {
    const query = areaId ? `?areaId=${encodeURIComponent(areaId)}` : '';
    return request<{ equipment: Equipment[] }>(`/api/equipment${query}`);
  },

  // Permits List & Stats
  getPermits: async (query: PermitListQuery = {}): Promise<PermitListResponse> => {
    const params = new URLSearchParams();
    if (query.page) params.set('page', query.page.toString());
    if (query.limit) params.set('limit', query.limit.toString());
    if (query.status) params.set('status', query.status);
    if (query.type) params.set('type', query.type);
    if (query.areaId) params.set('areaId', query.areaId);
    if (query.plantId) params.set('plantId', query.plantId);
    if (query.search) params.set('search', query.search);
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    if (query.mine) params.set('mine', 'true');
    if (query.pendingMyApproval) params.set('pendingMyApproval', 'true');
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.sortDir) params.set('sortDir', query.sortDir);

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await request<PermitListResponse>(`/api/permits${queryString}`);

    const items = res.items || res.permits || [];
    const pagination = res.pagination || {
      total: res.total || items.length,
      page: res.page || 1,
      limit: res.limit || 20,
      totalPages: res.pages || 1,
    };

    return {
      permits: items,
      items,
      total: pagination.total,
      page: pagination.page,
      limit: pagination.limit,
      pages: pagination.totalPages,
      pagination,
    };
  },

  getDashboardStats: (): Promise<DashboardStats> =>
    request<DashboardStats>('/api/permits/stats'),

  // Permit CRUD
  getPermit: (id: string) => request<PermitDetailResponse>(`/api/permits/${id}`),

  getAuditTimeline: (id: string) =>
    request<{ timeline: AuditLogEntry[] }>(`/api/permits/${id}/audit`),

  createPermit: (data: Record<string, unknown>) =>
    request<{ permit: Permit }>('/api/permits', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePermit: (id: string, data: Record<string, unknown>) =>
    request<{ permit: Permit }>(`/api/permits/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // State Machine Transitions
  submitPermit: (id: string, comment?: string) =>
    request<{ permit: Permit }>(`/api/permits/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),

  approvePermit: (id: string, body?: { comment?: string; signatureData?: string }) =>
    request<{ permit: Permit }>(`/api/permits/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  rejectPermit: (id: string, body: { comment: string }) =>
    request<{ permit: Permit }>(`/api/permits/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  activatePermit: (id: string, comment?: string) =>
    request<{ permit: Permit }>(`/api/permits/${id}/activate`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),

  suspendPermit: (id: string, body: { comment: string }) =>
    request<{ permit: Permit }>(`/api/permits/${id}/suspend`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  resumePermit: (id: string, comment?: string) =>
    request<{ permit: Permit }>(`/api/permits/${id}/resume`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),

  closePermit: (id: string, body: { completionNotes: string; comment?: string }) =>
    request<{ permit: Permit }>(`/api/permits/${id}/close`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  verifyPermit: (id: string, comment?: string) =>
    request<{ permit: Permit }>(`/api/permits/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),

  cancelPermit: (id: string, comment?: string) =>
    request<{ permit: Permit }>(`/api/permits/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),

  // Work Logs
  addWorkLog: (id: string, body: { kind: string; note: string }) =>
    request<{ workLog: PermitWorkLog }>(`/api/permits/${id}/work-logs`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
