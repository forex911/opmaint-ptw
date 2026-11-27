import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';
import { env } from '../config/env.js';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
}

/**
 * 404 Route Not Found middleware.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
}

/**
 * Centralized error handler enforcing unified response envelope:
 * { error: { code, message, details? } }
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected internal error occurred';
  let details: unknown = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    const formattedErrors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const fieldPath = issue.path.join('.') || '_root';
      if (!formattedErrors[fieldPath]) {
        formattedErrors[fieldPath] = [];
      }
      formattedErrors[fieldPath].push(issue.message);
    }
    details = formattedErrors;
  } else if (
    err !== null &&
    typeof err === 'object' &&
    (('status' in err && (err as { status: unknown }).status === 413) ||
      ('type' in err && (err as { type: unknown }).type === 'entity.too.large'))
  ) {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request payload exceeds maximum allowed size (100kb)';
  } else if (
    (err instanceof SyntaxError && 'status' in err && (err as { status: unknown }).status === 400) ||
    (err !== null && typeof err === 'object' && 'type' in err && (err as { type: unknown }).type === 'entity.parse.failed')
  ) {
    statusCode = 400;
    code = 'MALFORMED_JSON';
    message = 'Malformed JSON payload in request body';
  } else if (
    err !== null &&
    typeof err === 'object' &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number' &&
    (err as { status: number }).status >= 400 &&
    (err as { status: number }).status < 500
  ) {
    statusCode = (err as { status: number }).status;
    code = statusCode === 400 ? 'BAD_REQUEST' : 'CLIENT_ERROR';
    message = err instanceof Error && err.message ? err.message : 'Invalid client request';
  } else if (err instanceof Error) {
    // Unexpected Error in non-production
    message = err.message || message;
  }

  const envelope: ErrorEnvelope = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(env.NODE_ENV === 'development' && err instanceof Error && err.stack
        ? { stack: err.stack }
        : {}),
    },
  };

  res.status(statusCode).json(envelope);
}
