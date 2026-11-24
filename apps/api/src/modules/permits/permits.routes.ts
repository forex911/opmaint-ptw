import { Router } from 'express';
import { permitsController } from './permits.controller.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
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

// 3. Create permit (REQUESTER, ADMIN only)
permitsRouter.post(
  '/',
  requireRole(UserRole.REQUESTER, UserRole.ADMIN),
  validate({ body: createPermitSchema }),
  (req, res, next) => permitsController.create(req, res, next)
);

// 4. Get permit details
permitsRouter.get('/:id', (req, res, next) => permitsController.getById(req, res, next));

// 5. Update permit (optimistic locking with version)
permitsRouter.patch(
  '/:id',
  validate({ body: updatePermitSchema }),
  (req, res, next) => permitsController.update(req, res, next)
);

// 6. Audit timeline
permitsRouter.get('/:id/audit', (req, res, next) => permitsController.audit(req, res, next));

// 7. Work logs (ACTIVE permits only)
permitsRouter.post(
  '/:id/work-logs',
  validate({ body: createWorkLogSchema }),
  (req, res, next) => permitsController.addWorkLog(req, res, next)
);

// 8. Lifecycle Transitions
permitsRouter.post(
  '/:id/submit',
  (req, res, next) => permitsController.handleTransition('submit')(req, res, next)
);

permitsRouter.post(
  '/:id/approve',
  validate({ body: transitionActionSchema }),
  (req, res, next) => permitsController.handleTransition('approve')(req, res, next)
);

permitsRouter.post(
  '/:id/reject',
  validate({ body: transitionActionSchema }),
  (req, res, next) => permitsController.handleTransition('reject')(req, res, next)
);

permitsRouter.post(
  '/:id/activate',
  (req, res, next) => permitsController.handleTransition('activate')(req, res, next)
);

permitsRouter.post(
  '/:id/suspend',
  validate({ body: transitionActionSchema }),
  (req, res, next) => permitsController.handleTransition('suspend')(req, res, next)
);

permitsRouter.post(
  '/:id/resume',
  (req, res, next) => permitsController.handleTransition('resume')(req, res, next)
);

permitsRouter.post(
  '/:id/close',
  validate({ body: transitionActionSchema }),
  (req, res, next) => permitsController.handleTransition('close')(req, res, next)
);

permitsRouter.post(
  '/:id/verify',
  (req, res, next) => permitsController.handleTransition('verify')(req, res, next)
);

permitsRouter.post(
  '/:id/cancel',
  validate({ body: transitionActionSchema }),
  (req, res, next) => permitsController.handleTransition('cancel')(req, res, next)
);
