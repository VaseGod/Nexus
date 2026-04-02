// ============================================================================
// Global Error Handler
// ============================================================================

import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'error-handler' });

interface ApiError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export function errorHandler(
  error: Error & { status?: number; code?: string },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const status = error.status ?? 500;
  const code = error.code ?? 'INTERNAL_ERROR';

  const apiError: ApiError = {
    status,
    code,
    message: status === 500 ? 'Internal server error' : error.message,
    ...(process.env['NODE_ENV'] !== 'production' ? { details: error.stack } : {}),
  };

  logger.error({ error: error.message, status, code, stack: error.stack }, 'API error');
  res.status(status).json({ error: apiError });
}
