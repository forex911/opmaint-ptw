import { z } from 'zod';
import { UserRole } from './roles.js';

export const ADMIN_PASSWORD_MIN_LENGTH = 12;

const trimmedRequiredString = (label: string, maxLen = 120) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(maxLen, `${label} must be at most ${maxLen} characters`);

const normalizedEmailSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Valid email address is required');

export const adminPasswordSchema = z
  .string({ required_error: 'Password is required' })
  .min(
    ADMIN_PASSWORD_MIN_LENGTH,
    `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`
  )
  .max(128, 'Password must be at most 128 characters');

const userRoleEnumSchema = z.enum([
  UserRole.REQUESTER,
  UserRole.AREA_OWNER,
  UserRole.SAFETY_OFFICER,
  UserRole.ADMIN,
]);

export const createUserSchema = z.object({
  name: trimmedRequiredString('Name', 100),
  email: normalizedEmailSchema,
  password: adminPasswordSchema,
  role: userRoleEnumSchema,
  areaIds: z.array(z.string().uuid('Invalid area ID')).optional().default([]),
});

export const updateUserSchema = z
  .object({
    name: trimmedRequiredString('Name', 100).optional(),
    role: userRoleEnumSchema.optional(),
    isActive: z.boolean().optional(),
    areaIds: z.array(z.string().uuid('Invalid area ID')).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.role !== undefined ||
      data.isActive !== undefined ||
      data.areaIds !== undefined,
    { message: 'At least one field must be provided for update' }
  );

export const resetPasswordSchema = z.object({
  password: adminPasswordSchema,
});

export const createPlantSchema = z.object({
  code: trimmedRequiredString('Plant code', 40),
  name: trimmedRequiredString('Plant name', 120),
  address: z
    .string()
    .trim()
    .max(300, 'Address must be at most 300 characters')
    .nullable()
    .optional(),
});

export const updatePlantSchema = z
  .object({
    code: trimmedRequiredString('Plant code', 40).optional(),
    name: trimmedRequiredString('Plant name', 120).optional(),
    address: z
      .string()
      .trim()
      .max(300, 'Address must be at most 300 characters')
      .nullable()
      .optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.code !== undefined ||
      data.name !== undefined ||
      data.address !== undefined ||
      data.isActive !== undefined,
    { message: 'At least one field must be provided for update' }
  );

export const createAreaSchema = z.object({
  code: trimmedRequiredString('Area code', 40),
  name: trimmedRequiredString('Area name', 120),
  plantId: z.string().uuid('Invalid plant ID'),
  ownerId: z.string().uuid('Invalid owner ID'),
});

export const updateAreaSchema = z
  .object({
    code: trimmedRequiredString('Area code', 40).optional(),
    name: trimmedRequiredString('Area name', 120).optional(),
    plantId: z.string().uuid('Invalid plant ID').optional(),
    ownerId: z.string().uuid('Invalid owner ID').optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.code !== undefined ||
      data.name !== undefined ||
      data.plantId !== undefined ||
      data.ownerId !== undefined ||
      data.isActive !== undefined,
    { message: 'At least one field must be provided for update' }
  );

export const createEquipmentSchema = z.object({
  tag: trimmedRequiredString('Equipment tag', 40),
  name: trimmedRequiredString('Equipment name', 120),
  areaId: z.string().uuid('Invalid area ID'),
});

export const updateEquipmentSchema = z
  .object({
    tag: trimmedRequiredString('Equipment tag', 40).optional(),
    name: trimmedRequiredString('Equipment name', 120).optional(),
    areaId: z.string().uuid('Invalid area ID').optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.tag !== undefined ||
      data.name !== undefined ||
      data.areaId !== undefined ||
      data.isActive !== undefined,
    { message: 'At least one field must be provided for update' }
  );

export const AdminAuditEntityType = {
  USER: 'USER',
  PLANT: 'PLANT',
  AREA: 'AREA',
  EQUIPMENT: 'EQUIPMENT',
} as const;

export type AdminAuditEntityType = (typeof AdminAuditEntityType)[keyof typeof AdminAuditEntityType];

export const listAdminActivityQuerySchema = z.object({
  entityType: z.enum(['USER', 'PLANT', 'AREA', 'EQUIPMENT']).optional(),
  page: z.preprocess((val) => (val ? parseInt(String(val), 10) : 1), z.number().int().min(1)).default(1),
  limit: z.preprocess((val) => (val ? parseInt(String(val), 10) : 20), z.number().int().min(1).max(100)).default(20),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreatePlantInput = z.infer<typeof createPlantSchema>;
export type UpdatePlantInput = z.infer<typeof updatePlantSchema>;
export type CreateAreaInput = z.infer<typeof createAreaSchema>;
export type UpdateAreaInput = z.infer<typeof updateAreaSchema>;
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;
export type ListAdminActivityQuery = z.infer<typeof listAdminActivityQuerySchema>;
