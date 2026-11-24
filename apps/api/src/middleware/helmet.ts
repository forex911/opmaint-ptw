import type { Request, Response, NextFunction } from 'express';

/**
 * Security headers middleware implementing standard OWASP security recommendations.
 * Replaces helmet dependency without external network requirements.
 */
export function helmetMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking by restricting framing to same origin
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // HTTP Strict Transport Security (HSTS)
  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');

  // Disable browser XSS auditor which can introduce vulnerabilities
  res.setHeader('X-XSS-Protection', '0');

  // Control referrer information sent in HTTP requests
  res.setHeader('Referrer-Policy', 'no-referrer');

  // Basic Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'");

  // Disable DNS prefetching
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  // Cross-Origin Resource Policy
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // Remove Express powered-by header
  res.removeHeader('X-Powered-By');

  next();
}
