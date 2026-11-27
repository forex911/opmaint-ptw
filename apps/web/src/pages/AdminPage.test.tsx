import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminPage } from './AdminPage.js';
import * as clientModule from '../api/client.js';
import { ApiError } from '../api/client.js';

vi.mock('../context/AuthContext.js', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@cmms.local',
      role: 'ADMIN',
      isActive: true,
    },
    isAdmin: true,
    isRequester: false,
    isAreaOwner: false,
    isSafetyOfficer: false,
  }),
}));

describe('AdminPage Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    vi.spyOn(clientModule.api, 'getAdminUsers').mockResolvedValue({
      users: [
        {
          id: 'admin-1',
          name: 'Admin User',
          email: 'admin@cmms.local',
          role: 'ADMIN',
          isActive: true,
          ownedAreas: [],
        },
        {
          id: 'ao-1',
          name: 'Area Owner One',
          email: 'area.owner@cmms.local',
          role: 'AREA_OWNER',
          isActive: true,
          ownedAreas: [
            { id: 'area-1', plantId: 'plant-1', code: 'AREA-MPC-01', name: 'Alkylation Unit', isActive: true },
          ],
        },
        {
          id: 'ao-2',
          name: 'Area Owner Two',
          email: 'area.owner2@cmms.local',
          role: 'AREA_OWNER',
          isActive: true,
          ownedAreas: [],
        },
        {
          id: 'req-inactive',
          name: 'Inactive Tech',
          email: 'inactive@cmms.local',
          role: 'REQUESTER',
          isActive: false,
          ownedAreas: [],
        },
      ] as any,
    });

    vi.spyOn(clientModule.api, 'getAdminPlants').mockResolvedValue({
      plants: [
        {
          id: 'plant-1',
          code: 'PLANT-CHE-01',
          name: 'Manali Petrochemical Complex',
          address: 'Chennai',
          isActive: true,
          areaCount: 1,
        },
      ],
    });

    vi.spyOn(clientModule.api, 'getAdminAreas').mockResolvedValue({
      areas: [
        {
          id: 'area-1',
          plantId: 'plant-1',
          code: 'AREA-MPC-01',
          name: 'Alkylation Unit',
          ownerId: 'ao-1',
          ownerName: 'Area Owner One',
          ownerEmail: 'area.owner@cmms.local',
          plantName: 'Manali Petrochemical Complex',
          plantCode: 'PLANT-CHE-01',
          isActive: true,
          equipmentCount: 1,
        },
      ],
    });

    vi.spyOn(clientModule.api, 'getAdminEquipment').mockResolvedValue({
      equipment: [
        {
          id: 'eq-1',
          areaId: 'area-1',
          tag: 'P-101A',
          name: 'Acid Charge Pump',
          isActive: true,
          areaName: 'Alkylation Unit',
          areaCode: 'AREA-MPC-01',
          plantId: 'plant-1',
          plantName: 'Manali Petrochemical Complex',
        },
      ],
    });

    vi.spyOn(clientModule.api, 'getAdminActivity').mockResolvedValue({
      items: [
        {
          id: '1',
          actorId: 'admin-1',
          actorName: 'Admin User',
          actorEmail: 'admin@cmms.local',
          entityType: 'AREA',
          entityId: 'area-1',
          action: 'UPDATE',
          fromValue: { ownerId: 'ao-1' },
          toValue: { ownerId: 'ao-2' },
          createdAt: '2026-11-27T10:00:00.000Z',
        },
      ],
      pagination: { total: 1, page: 1, limit: 15, totalPages: 1 },
    });
  });

  const renderPage = (url = '/admin') =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('renders users, creates new user, and surfaces REASSIGN_AREAS_FIRST details cleanly', async () => {
    const createSpy = vi.spyOn(clientModule.api, 'createAdminUser').mockResolvedValue({
      user: { id: 'u-new', name: 'New Worker', email: 'new@cmms.local', role: 'REQUESTER', isActive: true },
    });

    renderPage();

    await waitFor(() => expect(screen.getAllByText('Area Owner One').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Inactive Tech').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Reactivate/i }).length).toBeGreaterThan(0);

    // Create user workflow
    fireEvent.click(screen.getByRole('button', { name: /Add User/i }));
    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'New Worker' } });
    fireEvent.change(screen.getByLabelText(/Work Email/i), { target: { value: 'new@cmms.local' } });
    fireEvent.change(screen.getByLabelText(/Initial Password/i), { target: { value: 'StrongPassword2026!' } });
    fireEvent.click(screen.getByRole('button', { name: /Create User/i }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        name: 'New Worker',
        email: 'new@cmms.local',
        password: 'StrongPassword2026!',
        role: 'REQUESTER',
        areaIds: [],
      });
    });

    // Trigger REASSIGN_AREAS_FIRST error banner when editing owner role
    vi.spyOn(clientModule.api, 'updateAdminUser').mockRejectedValueOnce(
      new ApiError(409, {
        code: 'REASSIGN_AREAS_FIRST',
        message: 'Reassign owned areas first',
        details: { areas: [{ id: 'area-1', code: 'AREA-MPC-01', name: 'Alkylation Unit' }] },
      })
    );

    const editButtons = screen.getAllByRole('button', { name: /^Edit$/i });
    // Second user row (Area Owner One)
    fireEvent.click(editButtons[1]);
    fireEvent.change(screen.getByLabelText(/^Role$/i), { target: { value: 'REQUESTER' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('REASSIGN_AREAS_FIRST');
      expect(screen.getByRole('alert')).toHaveTextContent('AREA-MPC-01');
    });
  });

  it('switches tabs to Plants, Areas (D-028 reassignment notice), Equipment, and Admin Activity', async () => {
    const createPlantSpy = vi.spyOn(clientModule.api, 'createAdminPlant').mockResolvedValue({
      plant: { id: 'p-2', code: 'PLANT-02', name: 'New Plant', address: null, isActive: true },
    });
    const updateAreaSpy = vi.spyOn(clientModule.api, 'updateAdminArea').mockResolvedValue({} as any);
    const createEqSpy = vi.spyOn(clientModule.api, 'createAdminEquipment').mockResolvedValue({} as any);

    renderPage();

    await waitFor(() => expect(screen.getByRole('tab', { name: /Plants/i })).toBeInTheDocument());

    // 1. Plants tab
    fireEvent.click(screen.getByRole('tab', { name: /Plants/i }));
    await waitFor(() => expect(screen.getByText('Industrial Plants')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add Plant/i }));
    fireEvent.change(screen.getByLabelText(/Plant Code/i), { target: { value: 'PLANT-02' } });
    fireEvent.change(screen.getByLabelText(/Facility Name/i), { target: { value: 'New Plant' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Plant/i }));
    await waitFor(() => expect(createPlantSpy).toHaveBeenCalledTimes(1));

    // 2. Areas tab & D-028 notice
    fireEvent.click(screen.getByRole('tab', { name: /Areas/i }));
    await waitFor(() => expect(screen.getByText('Operational Areas & Assigned Owners')).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /Edit \/ Owner/i })[0]);
    fireEvent.change(screen.getByLabelText(/Assigned Area Owner/i), { target: { value: 'ao-2' } });
    expect(screen.getByText(/Reassigning this area updates all/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() =>
      expect(updateAreaSpy).toHaveBeenCalledWith(
        'area-1',
        expect.objectContaining({ ownerId: 'ao-2' })
      )
    );

    // 3. Equipment tab
    fireEvent.click(screen.getByRole('tab', { name: /Equipment/i }));
    await waitFor(() => expect(screen.getByText('Tagged Industrial Equipment')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add Equipment/i }));
    fireEvent.change(screen.getByLabelText(/Asset Tag/i), { target: { value: 'V-200' } });
    fireEvent.change(screen.getByLabelText(/Equipment Name/i), { target: { value: 'Separator Vessel' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Equipment/i }));
    await waitFor(() =>
      expect(createEqSpy).toHaveBeenCalledWith({
        tag: 'V-200',
        name: 'Separator Vessel',
        areaId: 'area-1',
      })
    );

    // 4. Activity tab
    fireEvent.click(screen.getByRole('tab', { name: /Admin Activity/i }));
    await waitFor(() => expect(screen.getByText('Admin Activity Audit Log')).toBeInTheDocument());
    await waitFor(() => {
      expect(screen.getAllByText(/Admin User/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/admin@cmms.local/i).length).toBeGreaterThan(0);
    });
  });

  it('resets user password without error and renders /reference -> /admin redirect', async () => {
    const resetSpy = vi.spyOn(clientModule.api, 'resetAdminUserPassword').mockResolvedValue({
      message: 'Password updated successfully',
    });

    renderPage();

    await waitFor(() => expect(screen.getAllByText('Area Owner One').length).toBeGreaterThan(0));

    const resetBtns = screen.getAllByRole('button', { name: /^Reset$/i });
    fireEvent.click(resetBtns[0]);
    fireEvent.change(screen.getByLabelText(/New Password/i), {
      target: { value: 'NewStrongSecret2026!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

    await waitFor(() => {
      expect(resetSpy).toHaveBeenCalledWith('admin-1', { password: 'NewStrongSecret2026!' });
    });
  });
});
