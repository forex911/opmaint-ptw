import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreatePermitPage } from './CreatePermitPage.js';
import * as clientModule from '../api/client.js';

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
    user: { id: 'user-req-1', name: 'Test Requester', role: 'REQUESTER' },
    isAdmin: false,
    isRequester: true,
  }),
}));

describe('CreatePermitPage Equipment Cascade Component Tests (Bug 2)', () => {
  let queryClient: QueryClient;
  let createPermitSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    vi.spyOn(clientModule.api, 'getPlants').mockResolvedValue({
      plants: [
        { id: 'plant-100', name: 'Refinery Alpha', code: 'REF-A' } as any,
        { id: 'plant-200', name: 'Chemical Beta', code: 'CHM-B' } as any,
      ],
    });

    vi.spyOn(clientModule.api, 'getAreas').mockImplementation(async (plantId?: string) => {
      if (plantId === 'plant-100') {
        return {
          areas: [
            { id: 'area-101', plantId: 'plant-100', name: 'Boiler House', code: 'BH' } as any,
            { id: 'area-102', plantId: 'plant-100', name: 'Empty Storage Yard', code: 'EY' } as any,
          ],
        };
      }
      if (plantId === 'plant-200') {
        return {
          areas: [
            { id: 'area-201', plantId: 'plant-200', name: 'Distillation Column', code: 'DC' } as any,
          ],
        };
      }
      return { areas: [] };
    });

    vi.spyOn(clientModule.api, 'getEquipment').mockImplementation(async (areaId?: string) => {
      if (areaId === 'area-101') {
        return {
          equipment: [
            { id: 'eq-1', areaId: 'area-101', tagNo: 'P-101', name: 'Feedwater Pump' } as any,
          ],
        };
      }
      // Area 102 has NO equipment
      if (areaId === 'area-102') {
        return { equipment: [] };
      }
      if (areaId === 'area-201') {
        return {
          equipment: [
            { id: 'eq-201', areaId: 'area-201', tagNo: 'C-201', name: 'Column Shell' } as any,
          ],
        };
      }
      return { equipment: [] };
    });

    createPermitSpy = vi.spyOn(clientModule.api, 'createPermit').mockResolvedValue({
      permit: {
        id: 'new-permit-uuid',
        permitNo: 'PTW-2026-9999',
      } as any,
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <CreatePermitPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

  it('Plant -> Area -> Equipment cascade loads and resets selections on change', async () => {
    renderComponent();

    // Step 1: Advance to Step 2 (Job & Location)
    const nextBtn = screen.getByRole('button', { name: /Next: Location & Window/i });
    fireEvent.click(nextBtn);

    // 1. Initial State: Plant select exists
    const plantSelect = screen.getByLabelText(/^Plant/i) as HTMLSelectElement;
    const areaSelect = screen.getByLabelText(/^Area/i) as HTMLSelectElement;
    const equipSelect = screen.getByLabelText(/^Equipment/i) as HTMLSelectElement;

    expect(plantSelect.value).toBe('');
    expect(areaSelect.disabled).toBe(true);
    expect(equipSelect.disabled).toBe(true);

    // Wait for plants to load
    await waitFor(() => expect(screen.getByText(/Refinery Alpha/i)).toBeDefined());

    // 2. Select Plant-100 -> assert areas load
    fireEvent.change(plantSelect, { target: { value: 'plant-100' } });

    await waitFor(() => {
      expect(areaSelect.disabled).toBe(false);
      expect(screen.getByText('Boiler House (BH)')).toBeDefined();
    });

    // 3. Select Area-101 -> assert equipment loads
    fireEvent.change(areaSelect, { target: { value: 'area-101' } });

    await waitFor(() => {
      expect(equipSelect.disabled).toBe(false);
      expect(screen.getByText('Feedwater Pump (P-101)')).toBeDefined();
    });

    // Select equipment
    fireEvent.change(equipSelect, { target: { value: 'eq-1' } });
    expect(equipSelect.value).toBe('eq-1');

    // 4. Change plant to plant-200 -> assert area and equipment are reset
    fireEvent.change(plantSelect, { target: { value: 'plant-200' } });

    expect(areaSelect.value).toBe('');
    expect(equipSelect.value).toBe('');

    await waitFor(() => {
      expect(screen.getByText('Distillation Column (DC)')).toBeDefined();
    });
  });

  it('shows clear message when area has NO equipment', async () => {
    renderComponent();
    fireEvent.click(screen.getByRole('button', { name: /Next: Location & Window/i }));

    const plantSelect = screen.getByLabelText(/^Plant/i);
    const areaSelect = screen.getByLabelText(/^Area/i);
    const equipSelect = screen.getByLabelText(/^Equipment/i) as HTMLSelectElement;

    // Wait for plants to load
    await waitFor(() => expect(screen.getByText(/Refinery Alpha/i)).toBeDefined());

    // Select plant-100 and area-102 (no equipment)
    fireEvent.change(plantSelect, { target: { value: 'plant-100' } });
    await waitFor(() => expect(screen.getByText('Empty Storage Yard (EY)')).toBeDefined());

    fireEvent.change(areaSelect, { target: { value: 'area-102' } });

    await waitFor(() => {
      expect(screen.getByText('No equipment in this area (optional)')).toBeDefined();
      expect(equipSelect.disabled).toBe(true);
    });
  });

  it('submitting form without equipment sends payload without empty string equipmentId', async () => {
    renderComponent();

    // Step 1: Click next to Step 2
    fireEvent.click(screen.getByRole('button', { name: /Next: Location & Window/i }));

    // Fill Step 2 fields
    fireEvent.change(screen.getByPlaceholderText(/Flare line pipe spool welding/i), {
      target: { value: 'Repair steam leak in yard' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Apex Engineering/i), {
      target: { value: 'Maintenance Team A' },
    });

    const plantSelect = screen.getByLabelText(/^Plant/i);
    const areaSelect = screen.getByLabelText(/^Area/i);

    // Wait for plants to load
    await waitFor(() => expect(screen.getByText(/Refinery Alpha/i)).toBeDefined());

    fireEvent.change(plantSelect, { target: { value: 'plant-100' } });
    await waitFor(() => expect(screen.getByText('Empty Storage Yard (EY)')).toBeDefined());

    fireEvent.change(areaSelect, { target: { value: 'area-102' } });

    // Dates
    fireEvent.change(screen.getByLabelText(/Planned Start Time/i), {
      target: { value: '2026-11-25T10:00' },
    });
    fireEvent.change(screen.getByLabelText(/Planned End Time/i), {
      target: { value: '2026-11-25T18:00' },
    });

    // Advance through steps to Step 5
    fireEvent.click(screen.getByRole('button', { name: /Next:.*Safety Details/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next:.*Hazards/i }));
    fireEvent.click(screen.getByRole('button', { name: /Next:.*Review/i }));

    // Submit Draft
    const saveDraftBtn = screen.getByRole('button', { name: /Save Draft Only/i });
    fireEvent.click(saveDraftBtn);

    await waitFor(() => {
      expect(createPermitSpy).toHaveBeenCalledTimes(1);
    });

    const submittedPayload = createPermitSpy.mock.calls[0][0];
    expect(submittedPayload.plantId).toBe('plant-100');
    expect(submittedPayload.areaId).toBe('area-102');
    expect(submittedPayload.equipmentId).toBeUndefined();
    expect(submittedPayload).not.toHaveProperty('equipmentId', '');
  });
});
