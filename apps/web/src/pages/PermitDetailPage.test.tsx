import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PermitDetailPage } from './PermitDetailPage.js';
import { ErrorBoundary } from '../components/common/ErrorBoundary.js';
import * as clientModule from '../api/client.js';
import type { PermitDetailResponseDto, AuditLogEntryDto, PermitDto } from '@ptw/shared';
import { UserRole, PermitStatus } from '@ptw/shared';

let currentRole = UserRole.REQUESTER;
const mockNavigate = vi.fn();

vi.mock('../context/AuthContext.js', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'John Doe', role: currentRole },
    isAdmin: currentRole === UserRole.ADMIN,
    isRequester: currentRole === UserRole.REQUESTER,
    isAreaOwner: currentRole === UserRole.AREA_OWNER,
    isSafetyOfficer: currentRole === UserRole.SAFETY_OFFICER,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'dc6d20c6-d639-43c6-a0c7-e66872f019af' }),
    useNavigate: () => mockNavigate,
  };
});

const createMockPermit = (status: PermitStatus): PermitDto => ({
  id: 'dc6d20c6-d639-43c6-a0c7-e66872f019af',
  permitNo: `PTW-2026-${status.slice(0, 4)}`,
  type: 'HOT_WORK',
  status,
  requesterId: 'user-1',
  plantId: 'plant-1',
  areaId: 'area-1',
  equipmentId: 'eq-1',
  contractorTeam: 'Mechanical Crew A',
  workDescription: 'Repair pipe elbow on boiler feed',
  plannedStart: new Date().toISOString(),
  plannedEnd: new Date(Date.now() + 3600000).toISOString(),
  hazards: ['Flammable gases'],
  ppe: ['Safety glasses'],
  details: { hot_work_type: 'welding' },
  version: 1,
  completionNotes: status === PermitStatus.CLOSED_VERIFIED ? 'All checks complete' : null,
  closedAt: status === PermitStatus.CLOSED_VERIFIED ? new Date().toISOString() : null,
  verifiedBy: status === PermitStatus.CLOSED_VERIFIED ? 'safety-1' : null,
  verifiedAt: status === PermitStatus.CLOSED_VERIFIED ? new Date().toISOString() : null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  plantName: 'North Refinery',
  areaName: 'Boiler Room',
  equipmentName: 'Boiler 1',
  equipmentTag: 'B-01',
  requesterName: 'John Doe',
  requesterEmail: 'john@cmms.local',
});

const mockAuditTimeline: { timeline: AuditLogEntryDto[] } = {
  timeline: [
    {
      id: '33',
      permitId: 'dc6d20c6-d639-43c6-a0c7-e66872f019af',
      actorId: 'user-1',
      actorName: 'John Doe',
      actorEmail: 'john@cmms.local',
      actorRole: 'REQUESTER',
      action: 'CREATE_DRAFT',
      fromValue: null,
      toValue: { status: 'DRAFT' },
      comment: 'Draft created by requester',
      createdAt: new Date().toISOString(),
    },
    {
      id: '34',
      permitId: 'dc6d20c6-d639-43c6-a0c7-e66872f019af',
      actorId: 'user-1',
      actorName: 'John Doe',
      actorEmail: 'john@cmms.local',
      actorRole: 'REQUESTER',
      action: 'SUBMIT',
      fromValue: { status: 'DRAFT' },
      toValue: { status: 'PENDING_APPROVAL' },
      comment: 'Submitted for plant authorization',
      createdAt: new Date().toISOString(),
    },
  ],
};

describe('PermitDetailPage Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(clientModule.api, 'getAuditTimeline').mockResolvedValue(mockAuditTimeline as any);
  });

  const testStates: PermitStatus[] = [
    PermitStatus.DRAFT,
    PermitStatus.PENDING_APPROVAL,
    PermitStatus.ACTIVE,
    PermitStatus.SUSPENDED,
    PermitStatus.EXPIRED,
    PermitStatus.CLOSED_VERIFIED,
  ];

  testStates.forEach((status) => {
    it(`renders correctly for state ${status} with jsonb audit entries`, async () => {
      const mockDetail: PermitDetailResponseDto = {
        permit: createMockPermit(status),
        approvals: [
          {
            id: 'appr-1',
            permitId: 'dc6d20c6-d639-43c6-a0c7-e66872f019af',
            requiredRole: UserRole.SAFETY_OFFICER,
            requiredUserId: null,
            status: 'APPROVED',
            decidedBy: 'user-2',
            deciderName: 'Priya Nair',
            decidedAt: new Date().toISOString(),
            comment: 'Safety verified',
          },
        ],
        workLogs: [],
        allowedActions: status === PermitStatus.DRAFT ? ['submit'] : [],
      };

      vi.spyOn(clientModule.api, 'getPermit').mockResolvedValue(mockDetail as any);

      render(
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <PermitDetailPage />
          </BrowserRouter>
        </QueryClientProvider>
      );

      const permitNo = await screen.findByText(`PTW-2026-${status.slice(0, 4)}`);
      expect(permitNo).toBeInTheDocument();
      expect(screen.getByText('North Refinery')).toBeInTheDocument();
      expect(screen.getByText('Boiler Room')).toBeInTheDocument();
      expect(screen.getByText('Boiler 1 (B-01)')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  const roles: UserRole[] = [
    UserRole.REQUESTER,
    UserRole.AREA_OWNER,
    UserRole.SAFETY_OFFICER,
    UserRole.ADMIN,
  ];

  roles.forEach((role) => {
    it(`renders without white-screen crash for role ${role}`, async () => {
      currentRole = role;
      const mockDetail: PermitDetailResponseDto = {
        permit: createMockPermit(PermitStatus.PENDING_APPROVAL),
        approvals: [
          {
            id: 'appr-2',
            permitId: 'dc6d20c6-d639-43c6-a0c7-e66872f019af',
            requiredRole: UserRole.AREA_OWNER,
            requiredUserId: null,
            status: 'PENDING',
            decidedBy: null,
            deciderName: null,
            decidedAt: null,
            comment: null,
          },
        ],
        workLogs: [],
        allowedActions: role === UserRole.AREA_OWNER || role === UserRole.ADMIN ? ['approve', 'reject'] : [],
      };

      vi.spyOn(clientModule.api, 'getPermit').mockResolvedValue(mockDetail as any);

      render(
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <PermitDetailPage />
          </BrowserRouter>
        </QueryClientProvider>
      );

      const heading = await screen.findByText('PTW-2026-PEND');
      expect(heading).toBeInTheDocument();
    });
  });

  it('catches unhandled component crashes in ErrorBoundary and renders friendly fallback', () => {
    const CrashingComponent = () => {
      throw new Error('Simulated unexpected render failure');
    };

    render(
      <ErrorBoundary>
        <CrashingComponent />
      </ErrorBoundary>
    );

    expect(
      screen.getByText('Something went wrong while displaying this page')
    ).toBeInTheDocument();
    expect(screen.getByText('Back to Permits')).toBeInTheDocument();
  });

  describe('Stage 1 E4: Mandatory Reason/Completion Notes Modal Guard', () => {
    it.each([
      {
        action: 'reject' as const,
        triggerLabel: 'Reject Permit',
        confirmLabel: 'Confirm Reject',
        role: UserRole.AREA_OWNER,
        status: PermitStatus.PENDING_APPROVAL,
        placeholder: /Enter audit comment or explanation/i,
      },
      {
        action: 'suspend' as const,
        triggerLabel: 'Suspend Work',
        confirmLabel: 'Confirm Suspend',
        role: UserRole.SAFETY_OFFICER,
        status: PermitStatus.ACTIVE,
        placeholder: /Enter audit comment or explanation/i,
      },
      {
        action: 'cancel' as const,
        triggerLabel: 'Cancel Permit',
        confirmLabel: 'Confirm Cancel',
        role: UserRole.REQUESTER,
        status: PermitStatus.DRAFT,
        placeholder: /Enter audit comment or explanation/i,
      },
    ])(
      'disables Confirm button for $action without non-empty trimmed reason, shows inline hint, and never auto-fills fallback text',
      async ({ action, triggerLabel, confirmLabel, role, status, placeholder }) => {
        currentRole = role;
        const mockDetail: PermitDetailResponseDto = {
          permit: createMockPermit(status),
          approvals: [],
          workLogs: [],
          allowedActions: [action],
        };

        vi.spyOn(clientModule.api, 'getPermit').mockResolvedValue(mockDetail as any);
        const rejectSpy = vi.spyOn(clientModule.api, 'rejectPermit').mockResolvedValue({} as any);
        const suspendSpy = vi.spyOn(clientModule.api, 'suspendPermit').mockResolvedValue({} as any);
        const cancelSpy = vi.spyOn(clientModule.api, 'cancelPermit').mockResolvedValue({} as any);

        render(
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <PermitDetailPage />
            </BrowserRouter>
          </QueryClientProvider>
        );

        const triggerBtn = await screen.findByRole('button', { name: triggerLabel });
        fireEvent.click(triggerBtn);

        const confirmBtn = screen.getByRole('button', { name: confirmLabel });
        expect(confirmBtn).toBeDisabled();
        expect(screen.getByText(/Please enter a mandatory reason/i)).toBeInTheDocument();

        const textarea = screen.getByPlaceholderText(placeholder);
        fireEvent.change(textarea, { target: { value: '   ' } });
        expect(confirmBtn).toBeDisabled();

        fireEvent.change(textarea, { target: { value: '  Verified safety issue requires action  ' } });
        expect(confirmBtn).toBeEnabled();
        fireEvent.click(confirmBtn);

        await waitFor(() => {
          if (action === 'reject') {
            expect(rejectSpy).toHaveBeenCalledWith(mockDetail.permit.id, {
              comment: 'Verified safety issue requires action',
            });
          } else if (action === 'suspend') {
            expect(suspendSpy).toHaveBeenCalledWith(mockDetail.permit.id, {
              comment: 'Verified safety issue requires action',
            });
          } else {
            expect(cancelSpy).toHaveBeenCalledWith(
              mockDetail.permit.id,
              'Verified safety issue requires action'
            );
          }
        });
      }
    );

    it('disables Confirm Complete Work until trimmed completion notes are provided and shows inline hint', async () => {
      currentRole = UserRole.REQUESTER;
      const mockDetail: PermitDetailResponseDto = {
        permit: createMockPermit(PermitStatus.ACTIVE),
        approvals: [],
        workLogs: [],
        allowedActions: ['close'],
      };

      vi.spyOn(clientModule.api, 'getPermit').mockResolvedValue(mockDetail as any);
      const closeSpy = vi.spyOn(clientModule.api, 'closePermit').mockResolvedValue({} as any);

      render(
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <PermitDetailPage />
          </BrowserRouter>
        </QueryClientProvider>
      );

      const triggerBtn = await screen.findByRole('button', { name: 'Mark Work Complete' });
      fireEvent.click(triggerBtn);

      const confirmBtn = screen.getByRole('button', { name: 'Confirm Complete Work' });
      expect(confirmBtn).toBeDisabled();
      expect(screen.getByText(/Please enter mandatory completion notes/i)).toBeInTheDocument();

      const notesBox = screen.getByPlaceholderText(/Describe completed work/i);
      fireEvent.change(notesBox, { target: { value: '   ' } });
      expect(confirmBtn).toBeDisabled();

      fireEvent.change(notesBox, { target: { value: '  Pipe weld inspected and housekeeping complete  ' } });
      expect(confirmBtn).toBeEnabled();
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(closeSpy).toHaveBeenCalledWith(mockDetail.permit.id, {
          completionNotes: 'Pipe weld inspected and housekeeping complete',
          comment: undefined,
        });
      });
    });

    it('Bug B: navigates from Edit Draft to full /permits/:id/edit wizard and exposes field-level 422 errors + quick fix navigation on submit', async () => {
      currentRole = UserRole.REQUESTER;
      mockNavigate.mockClear();

      const mockDetail: PermitDetailResponseDto = {
        permit: createMockPermit(PermitStatus.DRAFT),
        approvals: [],
        workLogs: [],
        allowedActions: ['submit', 'cancel'],
      };

      vi.spyOn(clientModule.api, 'getPermit').mockResolvedValue(mockDetail as any);
      vi.spyOn(clientModule.api, 'submitPermit').mockRejectedValue(
        new clientModule.ApiError(422, {
          code: 'VALIDATION_ERROR',
          message: 'Select equipment from the chosen area',
          details: {
            equipmentId: ['Select equipment from the chosen area'],
            extinguisher_type: ['Fire Extinguisher Type is required'],
          },
        })
      );

      render(
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <PermitDetailPage />
          </BrowserRouter>
        </QueryClientProvider>
      );

      const editBtn = await screen.findByRole('button', { name: /Edit Draft/i });
      expect(screen.getByRole('button', { name: /Submit for Approval/i })).toBeInTheDocument();

      fireEvent.click(editBtn);
      expect(mockNavigate).toHaveBeenCalledWith(`/permits/${mockDetail.permit.id}/edit`);

      // Trigger submit error path from Detail Page
      fireEvent.click(screen.getByRole('button', { name: /Submit for Approval/i }));
      fireEvent.click(screen.getByRole('button', { name: /Confirm Submit for Approval/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit Draft & Fix Fields/i })).toBeInTheDocument();
      });
      expect(screen.getByText(/extinguisher_type/i)).toBeInTheDocument();
    });
  });
});
