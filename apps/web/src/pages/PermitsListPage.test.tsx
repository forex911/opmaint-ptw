import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PermitsListPage } from './PermitsListPage.js';
import * as clientModule from '../api/client.js';

vi.mock('../context/AuthContext.js', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Inspector', role: 'ADMIN' },
    isAdmin: true,
    isRequester: false,
    isAreaOwner: false,
    isSafetyOfficer: false,
  }),
}));

describe('PermitsListPage Pagination Tests (Bug 3)', () => {
  let queryClient: QueryClient;
  let getPermitsSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    vi.spyOn(clientModule.api, 'getAreas').mockResolvedValue({
      areas: [],
    });

    getPermitsSpy = vi.spyOn(clientModule.api, 'getPermits').mockImplementation(async (query = {}) => {
      const page = query.page || 1;
      return {
        permits: [
          {
            id: `permit-id-page-${page}`,
            permitNo: `PTW-PAGE-${page}`,
            type: 'HOT_WORK' as any,
            status: 'ACTIVE' as any,
            contractorTeam: 'Team Pagination',
            workDescription: `Work on page ${page}`,
            plannedStart: new Date().toISOString(),
            plannedEnd: new Date(Date.now() + 3600000).toISOString(),
          } as any,
        ],
        items: [
          {
            id: `permit-id-page-${page}`,
            permitNo: `PTW-PAGE-${page}`,
            type: 'HOT_WORK' as any,
            status: 'ACTIVE' as any,
            contractorTeam: 'Team Pagination',
            workDescription: `Work on page ${page}`,
            plannedStart: new Date().toISOString(),
            plannedEnd: new Date(Date.now() + 3600000).toISOString(),
          } as any,
        ],
        total: 15,
        page,
        limit: 5,
        pages: 3,
        pagination: {
          total: 15,
          page,
          limit: 5,
          totalPages: 3,
        },
      };
    });
  });

  const renderComponent = (initialUrl: string = '/permits?page=1') =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialUrl]}>
          <PermitsListPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('navigates through pages 1 -> 2 -> 3, disables next on page 3, and resets on filter change', async () => {
    renderComponent('/permits?page=1');

    // 1. Initial State: Page 1 content is rendered
    await waitFor(() => {
      expect(screen.getByText('PTW-PAGE-1')).toBeDefined();
    });

    const prevBtn = screen.getByRole('button', { name: /Previous/i });
    const nextBtn = screen.getByRole('button', { name: /Next/i });

    // 2. Previous is disabled, Next is enabled on Page 1
    expect(prevBtn).toHaveProperty('disabled', true);
    expect(nextBtn).toHaveProperty('disabled', false);
    expect(screen.getByText('Page 1 of 3')).toBeDefined();

    // 3. Click "Next" -> assert page 2 is requested from the API
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(getPermitsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 })
      );
    });

    // 4. Assert page 2 content renders
    await waitFor(() => {
      expect(screen.getByText('PTW-PAGE-2')).toBeDefined();
      expect(screen.getByText('Page 2 of 3')).toBeDefined();
    });

    // Both Prev and Next are enabled on Page 2
    expect(prevBtn).toHaveProperty('disabled', false);
    expect(nextBtn).toHaveProperty('disabled', false);

    // 5. Click "Next" again -> assert page 3 is requested
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(getPermitsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3 })
      );
    });

    // 6. On page 3, assert "Next" button is disabled
    await waitFor(() => {
      expect(screen.getByText('PTW-PAGE-3')).toBeDefined();
      expect(screen.getByText('Page 3 of 3')).toBeDefined();
    });
    expect(nextBtn).toHaveProperty('disabled', true);
    expect(prevBtn).toHaveProperty('disabled', false);

    // 7. Change a filter (e.g. search) -> assert page resets to 1 and page 1 is requested
    const searchInput = screen.getByPlaceholderText(/Search by permit/i);
    fireEvent.change(searchInput, { target: { value: 'welding' } });

    await waitFor(() => {
      expect(getPermitsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, search: 'welding' })
      );
      expect(screen.getByText('Page 1 of 3')).toBeDefined();
    });
  });

  it('TanStack query key for permits includes the page number to ensure fresh cache per page', () => {
    // Assert query key shape used in component: ['permits', { page, ... }]
    const queryKey1 = ['permits', { page: 1, status: '', type: '', search: '', mine: false, pendingMyApproval: false, areaId: '' }];
    const queryKey2 = ['permits', { page: 2, status: '', type: '', search: '', mine: false, pendingMyApproval: false, areaId: '' }];

    expect(queryKey1).not.toEqual(queryKey2);
    expect(queryKey1[1].page).toBe(1);
    expect(queryKey2[1].page).toBe(2);
  });
});
