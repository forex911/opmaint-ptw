import { Router } from 'express';
import { requireSweepSecret } from './internal.middleware.js';
import { sweepNow } from '../permits/sweeper/expiry-sweeper.js';

export const internalRouter = Router();

// Protect all /internal routes with secret verification
internalRouter.use(requireSweepSecret);

/**
 * POST /internal/sweep
 * Triggers an immediate sweep of all overdue permits.
 * Returns scanned count, expired count, and expired permit IDs.
 */
internalRouter.post('/sweep', async (_req, res, next) => {
  try {
    const result = await sweepNow();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
