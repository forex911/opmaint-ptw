import { Router } from 'express';
import { adminController } from './admin.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate, validateUuidParam } from '../../middleware/validate.js';
import { adminRateLimiter } from '../../middleware/rate-limit.js';
import {
  UserRole,
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  createPlantSchema,
  updatePlantSchema,
  createAreaSchema,
  updateAreaSchema,
  createEquipmentSchema,
  updateEquipmentSchema,
  listAdminActivityQuerySchema,
} from '@ptw/shared';

export const adminRouter = Router();

// All admin routes require authentication and ADMIN role (401 / 403 FORBIDDEN via requireRole)
adminRouter.use(requireAuth, requireRole(UserRole.ADMIN));

const sensitiveUserLimiter = adminRateLimiter();

// Users
adminRouter.get('/users', (req, res, next) => adminController.listUsers(req, res, next));
adminRouter.post(
  '/users',
  sensitiveUserLimiter,
  validate({ body: createUserSchema }),
  (req, res, next) => adminController.createUser(req, res, next)
);
adminRouter.patch(
  '/users/:id',
  validateUuidParam,
  validate({ body: updateUserSchema }),
  (req, res, next) => adminController.updateUser(req, res, next)
);
adminRouter.post(
  '/users/:id/reset-password',
  validateUuidParam,
  sensitiveUserLimiter,
  validate({ body: resetPasswordSchema }),
  (req, res, next) => adminController.resetPassword(req, res, next)
);

// Plants
adminRouter.get('/plants', (req, res, next) => adminController.listPlants(req, res, next));
adminRouter.post(
  '/plants',
  validate({ body: createPlantSchema }),
  (req, res, next) => adminController.createPlant(req, res, next)
);
adminRouter.patch(
  '/plants/:id',
  validateUuidParam,
  validate({ body: updatePlantSchema }),
  (req, res, next) => adminController.updatePlant(req, res, next)
);

// Areas
adminRouter.get('/areas', (req, res, next) => adminController.listAreas(req, res, next));
adminRouter.post(
  '/areas',
  validate({ body: createAreaSchema }),
  (req, res, next) => adminController.createArea(req, res, next)
);
adminRouter.patch(
  '/areas/:id',
  validateUuidParam,
  validate({ body: updateAreaSchema }),
  (req, res, next) => adminController.updateArea(req, res, next)
);

// Equipment
adminRouter.get('/equipment', (req, res, next) => adminController.listEquipment(req, res, next));
adminRouter.post(
  '/equipment',
  validate({ body: createEquipmentSchema }),
  (req, res, next) => adminController.createEquipment(req, res, next)
);
adminRouter.patch(
  '/equipment/:id',
  validateUuidParam,
  validate({ body: updateEquipmentSchema }),
  (req, res, next) => adminController.updateEquipment(req, res, next)
);

// Activity Audit Log
adminRouter.get(
  '/activity',
  validate({ query: listAdminActivityQuerySchema }),
  (req, res, next) => adminController.listActivity(req, res, next)
);
