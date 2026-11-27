import { Router } from 'express';
import { permitsController } from './permits.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate, validateUuidParam } from '../../middleware/validate.js';
import {
  createPermitSchema,
  updatePermitSchema,
  listPermitsQuerySchema,
  createWorkLogSchema,
  transitionActionSchema,
} from './permits.schema.js';
import { UserRole } from '@ptw/shared';

export const permitsRouter = Router();

// Universal read visibility: all authenticated users can access reads per D-020
permitsRouter.use(requireAuth);

// 1. Stats endpoint (registered before /:id to prevent route shadowing)
permitsRouter.get('/stats', (req, res, next) => permitsController.stats(req, res, next));

// 2. List endpoint
permitsRouter.get(
  '/',
  validate({ query: listPermitsQuerySchema }),
  (req, res, next) => permitsController.list(req, res, next)
);

// 3. Create permit (REQUESTER, SAFETY_OFFICER, ADMIN)
permitsRouter.post(
  '/',
  requireRole(UserRole.REQUESTER, UserRole.SAFETY_OFFICER, UserRole.ADMIN),
  validate({ body: createPermitSchema }),
  (req, res, next) => permitsController.create(req, res, next)
);

// 4. Get permit details
permitsRouter.get('/:id', validateUuidParam, (req, res, next) => permitsController.getById(req, res, next));

// 5. Update permit (optimistic locking with version)
permitsRouter.patch(
  '/:id',
  validateUuidParam,
  validate({ body: updatePermitSchema }),
  (req, res, next) => permitsController.update(req, res, next)
);

// 6. Audit timeline
permitsRouter.get('/:id/audit', validateUuidParam, (req, res, next) => permitsController.audit(req, res, next));

// 7. Work logs (ACTIVE permits only)
permitsRouter.post(
  '/:id/work-logs',
  validateUuidParam,
  validate({ body: createWorkLogSchema }),
  (req, res, next) => permitsController.addWorkLog(req, res, next)
);

// 8. Lifecycle Transitions
permitsRouter.post(
  '/:id/submit',
  validateUuidParam,
  (req, res, next) => permitsController.handleTransition('submit')(req, res, next)
);

permitsRouter.post(
  '/:id/approve',
  validateUuidParam,
  validate({ body: transitionActionSchema }),
  (req, res, next) => permitsController.handleTransition('approve')(req, res, next)
);

permitsRouter.post(
  '/:id/reject',
  validateUuidParam,
  validate({ body: transitionActionSchema }),
  (req, res, next) => permitsController.handleTransition('reject')(req, res, next)
);

permitsRouter.post(
  '/:id/activate',
  validateUuidParam,
  (req, res, next) => permitsController.handleTransition('activate')(req, res, next)
);

permitsRouter.post(
  '/:id/suspend',
  validateUuidParam,
  validate({ body: transitionActionSchema }),
  (req, res, next) => permitsController.handleTransition('suspend')(req, res, next)
);

permitsRouter.post(
  '/:id/resume',
  validateUuidParam,
  (req, res, next) => permitsController.handleTransition('resume')(req, res, next)
);

permitsRouter.post(
  '/:id/close',
  validateUuidParam,
  validate({ body: transitionActionSchema }),
  (req, res, next) => permitsController.handleTransition('close')(req, res, next)
);

permitsRouter.post(
  '/:id/verify',
  validateUuidParam,
  (req, res, next) => permitsController.handleTransition('verify')(req, res, next)
);

permitsRouter.post(
  '/:id/cancel',
  validateUuidParam,
  validate({ body: transitionActionSchema }),
  (req, res, next) => permitsController.handleTransition('cancel')(req, res, next)
);
