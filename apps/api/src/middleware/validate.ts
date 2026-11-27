import type { Request, Response, NextFunction } from 'express';
import { type ZodTypeAny, ZodError, z } from 'zod';
import { AppError } from '../errors/app-error.js';

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Express middleware for request schema validation using Zod.
 * Returns HTTP 422 with code VALIDATION_ERROR on validation failures per D-005.
 */
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID identifier'),
});

/**
 * Shared middleware for validating `:id` route parameters as UUIDs.
 * Returns 422 INVALID_ID so malformed identifiers never hit PostgreSQL syntax errors (500).
 */
export async function validateUuidParam(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    req.params = await uuidParamSchema.parseAsync(req.params);
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      const formattedErrors: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const key = issue.path.join('.') || 'id';
        formattedErrors[key] = formattedErrors[key] || [];
        formattedErrors[key].push(issue.message);
      }
      return next(new AppError(422, 'INVALID_ID', 'Invalid resource ID format', formattedErrors));
    }
    next(error);
  }
}

export function validate(schemas: ValidationSchemas) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors: Record<string, string[]> = {};
        for (const issue of error.issues) {
          const path = issue.path.join('.') || '_root';
          if (!formattedErrors[path]) {
            formattedErrors[path] = [];
          }
          formattedErrors[path].push(issue.message);
        }
        return next(new AppError(422, 'VALIDATION_ERROR', 'Validation failed', formattedErrors));
      }
      next(error);
    }
  };
}
