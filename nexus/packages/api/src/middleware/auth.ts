// ============================================================================
// JWT Auth Middleware
// ============================================================================

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'auth-middleware' });
const JWT_SECRET = process.env['JWT_SECRET'] ?? 'nexus-dev-secret';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  workspaceId?: string;
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      workspaceId: string;
    };

    req.userId = decoded.userId;
    req.workspaceId = decoded.workspaceId;
    next();
  } catch (error) {
    logger.warn({ error }, 'JWT verification failed');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
