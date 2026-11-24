import cron, { type ScheduledTask } from 'node-cron';
import { getPool } from '../../../db/client.js';
import { bulkExpireOverduePermits, type BulkExpiryResult } from '../services/expiry.service.js';
import { env } from '../../../config/env.js';

export interface SweeperOptions {
  /** Cron schedule expression, defaults to env.SWEEP_CRON_SCHEDULE or '* * * * *' */
  schedule?: string;
  /** Injectable clock returning the current virtual or real timestamp */
  clock?: () => Date;
  /** Optional custom scheduler implementation for unit tests */
  scheduler?: (schedule: string, task: () => Promise<void> | void) => ScheduledTask;
}

export class ExpirySweeper {
  private scheduledTask: ScheduledTask | null = null;
  private isSweeping = false;
  private currentSweepPromise: Promise<BulkExpiryResult> | null = null;
  private clock: () => Date = () => new Date();
  private schedule: string = env.SWEEP_CRON_SCHEDULE || '* * * * *';

  /**
   * Executes a single sweep cycle immediately with optional explicit timestamp.
   * Prevents overlapping sweep executions within the current process.
   */
  async sweepNow(customNow?: Date): Promise<BulkExpiryResult> {
    if (this.isSweeping) {
      // Overlapping execution in-process is safely skipped
      return {
        scanned: 0,
        expiredCount: 0,
        expiredPermitIds: [],
      };
    }

    this.isSweeping = true;
    const now = customNow || this.clock();

    const sweepPromise = (async () => {
      try {
        const pool = getPool();
        const result = await bulkExpireOverduePermits(pool, now);
        return result;
      } finally {
        this.isSweeping = false;
        this.currentSweepPromise = null;
      }
    })();

    this.currentSweepPromise = sweepPromise;
    return sweepPromise;
  }

  /**
   * Starts the background cron scheduler.
   * Validates the cron expression, ensures idempotent startup, and schedules periodic runs.
   */
  start(options: SweeperOptions = {}): ScheduledTask {
    // 1. Idempotency: if already running, return existing task
    if (this.scheduledTask) {
      return this.scheduledTask;
    }

    this.clock = options.clock || (() => new Date());
    this.schedule = options.schedule || env.SWEEP_CRON_SCHEDULE || '* * * * *';

    // 2. Validate cron expression
    if (!cron.validate(this.schedule)) {
      throw new Error(`Invalid cron expression for background expiry sweeper: '${this.schedule}'`);
    }

    const taskFn = async () => {
      try {
        await this.sweepNow();
      } catch (err) {
        // Silently log or swallow uncaught sweeper errors to prevent crashing process
        console.error('⚠️ [ExpirySweeper] Background sweep cycle encountered error:', err);
      }
    };

    if (options.scheduler) {
      this.scheduledTask = options.scheduler(this.schedule, taskFn);
    } else {
      this.scheduledTask = cron.schedule(this.schedule, taskFn);
    }

    return this.scheduledTask;
  }

  /**
   * Stops the background cron scheduler gracefully.
   * Safe to call repeatedly; waits for any currently active in-flight sweep to finish.
   */
  async stop(): Promise<void> {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
    }

    // Await active in-flight sweep if running to ensure database transactions finish cleanly
    if (this.currentSweepPromise) {
      try {
        await this.currentSweepPromise;
      } catch {
        // ignore errors from in-flight sweep during shutdown
      }
      this.currentSweepPromise = null;
    }
  }

  /**
   * Returns whether the sweeper scheduler is currently active.
   */
  isRunning(): boolean {
    return this.scheduledTask !== null;
  }

  /**
   * Returns whether a sweep operation is currently in-flight.
   */
  isBusy(): boolean {
    return this.isSweeping;
  }
}

// Global singleton instance for the process
export const expirySweeper = new ExpirySweeper();

export function startSweeper(options?: SweeperOptions): ScheduledTask {
  return expirySweeper.start(options);
}

export async function stopSweeper(): Promise<void> {
  await expirySweeper.stop();
}

export async function sweepNow(now?: Date): Promise<BulkExpiryResult> {
  return expirySweeper.sweepNow(now);
}
