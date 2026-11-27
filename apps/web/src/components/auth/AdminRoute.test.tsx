import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminRoute } from './AdminRoute.js';
import * as AuthContextModule from '../../context/AuthContext.js';

describe('AdminRoute Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks non-admin authenticated users with Administrator Access Required view', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'u-req',
        name: 'Req User',
        email: 'requester@cmms.local',
        role: 'REQUESTER',
        isActive: true,
      } as any,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshSession: vi.fn(),
      isRequester: true,
      isAdmin: false,
      isAreaOwner: false,
      isSafetyOfficer: false,
    });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <div>Admin Secret Console</div>
              </AdminRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('admin-forbidden')).toBeInTheDocument();
    expect(screen.getByText(/Administrator Access Required/i)).toBeInTheDocument();
    expect(screen.queryByText('Admin Secret Console')).not.toBeInTheDocument();
  });

  it('allows ADMIN users to view protected admin content', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'u-admin',
        name: 'Admin User',
        email: 'admin@cmms.local',
        role: 'ADMIN',
        isActive: true,
      } as any,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshSession: vi.fn(),
      isRequester: false,
      isAdmin: true,
      isAreaOwner: false,
      isSafetyOfficer: false,
    });

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AdminRoute>
          <div>Admin Secret Console</div>
        </AdminRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Admin Secret Console')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-forbidden')).not.toBeInTheDocument();
  });

  it('redirects legacy /reference route to /admin for admin users', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'u-admin',
        name: 'Admin User',
        email: 'admin@cmms.local',
        role: 'ADMIN',
        isActive: true,
      } as any,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshSession: vi.fn(),
      isRequester: false,
      isAdmin: true,
      isAreaOwner: false,
      isSafetyOfficer: false,
    });

    render(
      <MemoryRouter initialEntries={['/reference']}>
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <div>Admin Secret Console</div>
              </AdminRoute>
            }
          />
          <Route path="/reference" element={<Navigate to="/admin" replace />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Admin Secret Console')).toBeInTheDocument();
  });
});
