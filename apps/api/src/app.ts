import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { helmetMiddleware } from './middleware/helmet.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { referenceRouter } from './modules/reference/reference.routes.js';
import { permitsRouter } from './modules/permits/permits.routes.js';
import { internalRouter } from './modules/internal/internal.routes.js';

export function createApp(configure?: (app: Express) => void): Express {
  const app = express();

  // Trust proxy for reverse proxy environments (e.g. Nginx, Vercel, load balancers)
  app.set('trust proxy', 1);

  // Security headers
  app.use(helmetMiddleware);

  // Cross-Origin Resource Sharing (CORS) with credentials enabled
  const allowedOrigins = env.CORS_ORIGIN.includes(',')
    ? env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : env.CORS_ORIGIN;

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );

  // Parse cookies using secret
  app.use(cookieParser(env.COOKIE_SECRET));

  // Parse JSON bodies
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API routers
  app.use('/api/auth', authRouter);
  app.use('/api/permits', permitsRouter);
  app.use('/api', referenceRouter);
  app.use('/internal', internalRouter);

  // Optional custom configuration (e.g. test-only routes) before 404 handler
  if (configure) {
    configure(app);
  }

  // 404 handler for unmatched routes
  app.use(notFoundHandler);

  // Centralized error handler returning { error: { code, message, details? } }
  app.use(errorHandler);

  return app;
}

export const app = createApp();
