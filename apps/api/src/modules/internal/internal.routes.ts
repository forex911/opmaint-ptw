import { Router } from 'express';
import { requireSweepSecret, sweepRateLimiter } from './internal.middleware.js';
import { sweepNow } from '../permits/sweeper/expiry-sweeper.js';

export const internalRouter = Router();

// Apply rate limiting and secret verification to all /internal routes
internalRouter.use(sweepRateLimiter);
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
