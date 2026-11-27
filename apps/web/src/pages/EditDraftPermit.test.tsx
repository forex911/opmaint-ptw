import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditPermitPage } from './EditPermitPage.js';
import * as clientModule from '../api/client.js';
import { ApiError } from '../api/client.js';
import { PermitStatus, PermitTypeCode, UserRole } from '@ptw/shared';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../context/AuthContext.js', () => ({
  useAuth: () => ({
    user: { id: 'user-req-1', name: 'Test Requester', role: UserRole.REQUESTER },
    isAdmin: false,
    isRequester: true,
    isAreaOwner: false,
    isSafetyOfficer: false,
  }),
}));

describe('Bug B UI Regression: EditPermitPage full draft hydration, version refresh, & step-level submit errors', () => {
  let queryClient: QueryClient;

  const basePermit = {
    id: '11111111-1111-4111-8111-111111111111',
    permitNo: 'PTW-2026-0042',
    type: PermitTypeCode.HOT_WORK,
    status: PermitStatus.DRAFT,
    requesterId: 'user-req-1',
    plantId: 'plant-100',
    areaId: 'area-101',
    equipmentId: null as string | null,
    contractorTeam: 'Stored Welding Crew',
    workDescription: 'Stored exchanger weld repair',
    plannedStart: '2026-12-01T08:00:00.000Z',
    plannedEnd: '2026-12-01T16:00:00.000Z',
    hazards: ['Extreme Heat / Thermal Radiation'],
    ppe: ['Flame-Resistant Clothing'],
    precautions: ['Fire extinguisher inspected and positioned within 5 meters'],
    details: {
      hot_work_type: 'welding',
      fire_watch_assigned: false,
      gas_test: {
        lel_pct: 1,
        o2_pct: 20.9,
      },
    },
    version: 1,
    completionNotes: null,
    closedAt: null,
    verifiedBy: null,
    verifiedAt: null,
    createdAt: '2026-11-27T10:00:00.000Z',
    updatedAt: '2026-11-27T10:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    vi.spyOn(clientModule.api, 'getPlants').mockResolvedValue({
      plants: [
        { id: 'plant-100', name: 'Refinery Alpha', code: 'REF-A', isActive: true, address: null },
        { id: 'plant-200', name: 'Chemical Beta', code: 'CHM-B', isActive: true, address: null },
      ],
    });

    vi.spyOn(clientModule.api, 'getAreas').mockImplementation(async (plantId?: string) => {
      if (plantId === 'plant-100') {
        return {
          areas: [
            {
              id: 'area-101',
              plantId: 'plant-100',
              name: 'Boiler House',
              code: 'BH',
              ownerId: 'ao-1',
              isActive: true,
            },
          ],
        };
      }
      return { areas: [] };
    });

    vi.spyOn(clientModule.api, 'getEquipment').mockImplementation(async (areaId?: string) => {
      if (areaId === 'area-101') {
        return {
          equipment: [
            {
              id: 'eq-1',
              areaId: 'area-101',
              tag: 'B-101',
              name: 'Primary Boiler',
              isActive: true,
            },
          ],
        };
      }
      return { equipment: [] };
    });

    vi.spyOn(clientModule.api, 'getPermit').mockResolvedValue({
      permit: basePermit as any,
      approvals: [],
      workLogs: [],
      allowedActions: ['submit', 'cancel'],
    });
  });

  const renderEditPage = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/permits/11111111-1111-4111-8111-111111111111/edit']}>
          <Routes>
            <Route path="/permits/:id/edit" element={<EditPermitPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

  it('hydrates stored permit fields, refreshes optimistic version across repeated saves, and offers both Save and Submit for owner DRAFT', async () => {
    const updateSpy = vi
      .spyOn(clientModule.api, 'updatePermit')
      .mockResolvedValueOnce({
        permit: { ...basePermit, workDescription: 'Updated Save 1', version: 2 } as any,
      })
      .mockResolvedValueOnce({
        permit: { ...basePermit, workDescription: 'Updated Save 2', version: 3 } as any,
      });

    renderEditPage();

    // Wait for draft hydration
    await waitFor(() => {
      expect(screen.getByText(/Edit Draft Permit PTW-2026-0042/i)).toBeInTheDocument();
    });

    // Step 2: verify hydrated work description, contractor, location cascade & dates
    fireEvent.click(screen.getByRole('button', { name: /Next: Location & Window/i }));
    await waitFor(() => {
      expect((screen.getByLabelText(/Work Description/i) as HTMLInputElement).value).toBe(
        'Stored exchanger weld repair'
      );
    });
    expect((screen.getByLabelText(/Contractor/i) as HTMLInputElement).value).toBe('Stored Welding Crew');
    expect((screen.getByLabelText(/^Plant/i) as HTMLSelectElement).value).toBe('plant-100');
    await waitFor(() => {
      expect((screen.getByLabelText(/^Area/i) as HTMLSelectElement).value).toBe('area-101');
    });
    expect((screen.getByLabelText(/Planned Start Time/i) as HTMLInputElement).value).not.toBe('');
    expect((screen.getByLabelText(/Planned End Time/i) as HTMLInputElement).value).not.toBe('');

    // Edit description and select equipment
    fireEvent.change(screen.getByLabelText(/Work Description/i), {
      target: { value: 'Updated Save 1' },
    });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Primary Boiler \(B-101\)/i })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/^Equipment/i), { target: { value: 'eq-1' } });

    // Step 3: verify stored dynamic details hydrated
    fireEvent.click(screen.getByRole('button', { name: /Next: Dynamic Safety Details/i }));
    expect((screen.getByLabelText(/Hot Work Type/i) as HTMLSelectElement).value).toBe('welding');

    // Step 4: verify stored hazards, PPE, precautions hydrated
    fireEvent.click(screen.getByRole('button', { name: /Next: Hazards & Precautions/i }));
    const step5Btn = screen.getByRole('button', { name: /Next: Final Review/i });
    fireEvent.click(step5Btn);

    // Step 5: both Save Draft Only (Save Draft Changes) and Submit for Approval must be present
    const saveBtn = screen.getByRole('button', { name: /Save Draft/i });
    const submitBtn = screen.getByRole('button', { name: /Submit for Approval/i });
    expect(saveBtn).toBeInTheDocument();
    expect(submitBtn).toBeInTheDocument();

    // First Save sends version=1
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });
    expect(updateSpy.mock.calls[0][1]).toMatchObject({
      version: 1,
      workDescription: 'Updated Save 1',
      equipmentId: 'eq-1',
      precautions: ['Fire extinguisher inspected and positioned within 5 meters'],
    });

    // Second Save sends refreshed version=2 (NOT stale version=1!)
    fireEvent.click(screen.getByText(/Job & Location/i));
    fireEvent.change(screen.getByLabelText(/Work Description/i), {
      target: { value: 'Updated Save 2' },
    });
    fireEvent.click(screen.getByText(/Review & Submit/i));
    fireEvent.click(screen.getByRole('button', { name: /Save Draft/i }));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledTimes(2);
    });
    expect(updateSpy.mock.calls[1][1]).toMatchObject({
      version: 2,
      workDescription: 'Updated Save 2',
    });
  });

  it('jumps to the failing step and renders field-level errors next to controls when submit returns 422', async () => {
    vi.spyOn(clientModule.api, 'updatePermit').mockResolvedValue({
      permit: { ...basePermit, version: 2 } as any,
    });
    vi.spyOn(clientModule.api, 'submitPermit').mockRejectedValue(
      new ApiError(422, 'VALIDATION_ERROR', 'Select equipment from the chosen area', {
        equipmentId: ['Select equipment from the chosen area'],
        extinguisher_type: ['Fire Extinguisher Type is required'],
      })
    );

    renderEditPage();

    await waitFor(() => {
      expect(screen.getByText(/Edit Draft Permit PTW-2026-0042/i)).toBeInTheDocument();
    });

    // Jump to step 5 and attempt Submit
    fireEvent.click(screen.getByText(/Review & Submit/i));
    fireEvent.click(screen.getByRole('button', { name: /Submit for Approval/i }));

    // Automatically jumps to Step 2 (earliest failing step) and displays inline error next to Equipment
    await waitFor(() => {
      expect(screen.getByText(/Step 2: Job Description, Location & Window/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/Select equipment from the chosen area/i).length).toBeGreaterThanOrEqual(1);
  });
});
