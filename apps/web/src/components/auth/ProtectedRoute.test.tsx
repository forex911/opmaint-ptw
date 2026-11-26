import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute.js';
import * as AuthContextModule from '../../context/AuthContext.js';

describe('ProtectedRoute Component', () => {
  it('renders professional OPMAINT branded reload screen with logo during session verification', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
      isRequester: false,
      isAdmin: false,
      isAreaOwner: false,
      isSafetyOfficer: false,
    });

    render(
      <MemoryRouter initialEntries={['/permits']}>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    // Verify brand identity and logo are rendered cleanly
    expect(screen.getByText('OPMAINT')).toBeInTheDocument();
    expect(screen.getByText(/Permit to Work Safety System/i)).toBeInTheDocument();
    expect(screen.getByAltText('OPMAINT Logo')).toBeInTheDocument();
    expect(screen.getByText(/Verifying Certified Session.../i)).toBeInTheDocument();
    expect(screen.getByText(/OSHA 1910/i)).toBeInTheDocument();

    // Protected content should NOT be rendered while loading
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});
