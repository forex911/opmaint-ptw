import { z } from 'zod';
import {
  ALL_PERMIT_STATUSES,
  ALL_PERMIT_TYPE_CODES,
  type PermitStatusCode,
  type PermitTypeCode,
} from '@ptw/shared';

export const createPermitSchema = z
  .object({
    type: z.enum(ALL_PERMIT_TYPE_CODES as [PermitTypeCode, ...PermitTypeCode[]], {
      errorMap: () => ({ message: 'Invalid permit type' }),
    }),
    plantId: z.string().uuid({ message: 'Invalid plant ID format' }),
    areaId: z.string().uuid({ message: 'Invalid area ID format' }),
    equipmentId: z.string().uuid({ message: 'Invalid equipment ID format' }).nullable().optional(),
    contractorTeam: z.string().min(1, { message: 'Contractor team is required' }),
    workDescription: z.string().min(1, { message: 'Work description is required' }),
    plannedStart: z.string().datetime({ message: 'plannedStart must be an ISO 8601 datetime' }),
    plannedEnd: z.string().datetime({ message: 'plannedEnd must be an ISO 8601 datetime' }),
    hazards: z.array(z.string()).optional().default([]),
    ppe: z.array(z.string()).optional().default([]),
    details: z.record(z.unknown()).optional().default({}),
  })
  .refine(
    (data) => new Date(data.plannedEnd) > new Date(data.plannedStart),
    {
      message: 'planned_end must be strictly greater than planned_start',
      path: ['plannedEnd'],
    }
  );

export const updatePermitSchema = z
  .object({
    version: z.number().int({ message: 'version must be an integer' }).positive({
      message: 'version is required for optimistic concurrency locking',
    }),
    plantId: z.string().uuid({ message: 'Invalid plant ID format' }).optional(),
    areaId: z.string().uuid({ message: 'Invalid area ID format' }).optional(),
    equipmentId: z.string().uuid({ message: 'Invalid equipment ID format' }).nullable().optional(),
    contractorTeam: z.string().min(1).optional(),
    workDescription: z.string().min(1).optional(),
    plannedStart: z.string().datetime({ message: 'plannedStart must be an ISO 8601 datetime' }).optional(),
    plannedEnd: z.string().datetime({ message: 'plannedEnd must be an ISO 8601 datetime' }).optional(),
    hazards: z.array(z.string()).optional(),
    ppe: z.array(z.string()).optional(),
    details: z.record(z.unknown()).optional(),
  })
  .strict({
    message: 'Disallowed fields detected; status, requesterId, and permitNo cannot be modified via update',
  });

export const listPermitsQuerySchema = z.object({
  status: z.enum(ALL_PERMIT_STATUSES as [PermitStatusCode, ...PermitStatusCode[]]).optional(),
  type: z.enum(ALL_PERMIT_TYPE_CODES as [PermitTypeCode, ...PermitTypeCode[]]).optional(),
  areaId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  mine: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  pendingMyApproval: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  page: z.preprocess((val) => (val ? parseInt(String(val), 10) : 1), z.number().int().min(1)).default(1),
  limit: z.preprocess((val) => (val ? parseInt(String(val), 10) : 20), z.number().int().min(1).max(100)).default(20),
  sortBy: z.enum(['created_at', 'planned_start', 'planned_end', 'permit_no', 'status']).default('created_at'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const createWorkLogSchema = z.object({
  kind: z.enum(['NOTE', 'ENTRY', 'EXIT'], {
    errorMap: () => ({ message: "Kind must be one of 'NOTE', 'ENTRY', 'EXIT'" }),
  }),
  note: z.string().min(1, { message: 'Work log note cannot be empty' }),
});

export const transitionActionSchema = z.object({
  comment: z.string().optional(),
  completion_notes: z.string().optional(),
});
