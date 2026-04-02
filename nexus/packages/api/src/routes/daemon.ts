// ============================================================================
// Daemon Router — subscription management
// ============================================================================

import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { KairosDaemon } from '@nexus/daemon';

export const daemonRouter = Router();

const daemon = new KairosDaemon(process.env['DAEMON_BASE_PATH'] ?? './daemon');

// Initialize daemon on first request
let started = false;
async function ensureStarted(): Promise<void> {
  if (!started) {
    await daemon.start();
    started = true;
  }
}

// ---- POST /daemon/subscribe ----
const SubscribeSchema = z.object({
  type: z.enum(['webhook', 'slack', 'github', 'sse']),
  nlahId: z.string().min(1),
  config: z.record(z.unknown()),
});

daemonRouter.post('/subscribe', async (req: AuthenticatedRequest, res, next) => {
  try {
    await ensureStarted();
    const parseResult = SubscribeSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.issues });
      return;
    }

    const { type, nlahId, config } = parseResult.data;
    const result = daemon.addSubscription(type, nlahId, config);

    if (result.isErr()) {
      res.status(500).json({ error: result.error.message });
      return;
    }

    res.status(201).json({ subscription: result.value });
  } catch (error) {
    next(error);
  }
});

// ---- GET /daemon/subscriptions ----
daemonRouter.get('/subscriptions', async (_req: AuthenticatedRequest, res) => {
  await ensureStarted();
  res.json({ subscriptions: daemon.getSubscriptions() });
});

// ---- GET /daemon/audit-log ----
daemonRouter.get('/audit-log', async (_req: AuthenticatedRequest, res) => {
  await ensureStarted();
  res.json({ entries: daemon.getAuditLog() });
});
