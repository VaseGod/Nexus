// ============================================================================
// Proxy Router — forwards to compaction, edge, and speculative services
// ============================================================================

import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'proxy-router' });

export const proxyRouter = Router();

const COMPACTION_URL = process.env['COMPACTION_WORKER_URL'] ?? 'http://localhost:8001';
const EDGE_URL = process.env['EDGE_SERVER_URL'] ?? 'http://localhost:8003';
const AURORA_URL = process.env['AURORA_CONTROLLER_URL'] ?? 'http://localhost:8002';

async function proxyGet(targetUrl: string, res: any): Promise<void> {
  try {
    const response = await fetch(targetUrl);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    logger.error({ targetUrl, error }, 'Proxy request failed');
    res.status(502).json({ error: 'Upstream service unavailable' });
  }
}

// ---- GET /compaction/status ----
proxyRouter.get('/compaction/status', async (_req: AuthenticatedRequest, res) => {
  await proxyGet(`${COMPACTION_URL}/compaction/status`, res);
});

// ---- GET /edge/health ----
proxyRouter.get('/edge/health', async (_req: AuthenticatedRequest, res) => {
  await proxyGet(`${EDGE_URL}/health`, res);
});

// ---- GET /speculative/metrics ----
proxyRouter.get('/speculative/metrics', async (_req: AuthenticatedRequest, res) => {
  await proxyGet(`${AURORA_URL}/draft-model/metrics`, res);
});
