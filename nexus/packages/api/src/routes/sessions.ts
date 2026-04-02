// ============================================================================
// Sessions Router — IHR session management + SSE events
// ============================================================================

import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'sessions-router' });

export const sessionsRouter = Router();

// In-memory session store (in production: backed by database)
const activeSessions = new Map<string, {
  id: string;
  nlahId: string;
  status: string;
  startedAt: string;
  events: Array<Record<string, unknown>>;
}>();

// ---- Schemas ----

const CreateSessionSchema = z.object({
  nlahId: z.string().min(1),
  input: z.string().min(1),
});

// ---- POST /sessions ----

sessionsRouter.post('/', (req: AuthenticatedRequest, res) => {
  const parseResult = CreateSessionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.issues });
    return;
  }

  const { nlahId, input } = parseResult.data;
  const sessionId = uuid();

  activeSessions.set(sessionId, {
    id: sessionId,
    nlahId,
    status: 'running',
    startedAt: new Date().toISOString(),
    events: [],
  });

  logger.info({ sessionId, nlahId }, 'Session created');

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send initial event
  res.write(`data: ${JSON.stringify({ type: 'session_start', sessionId, nlahId })}\n\n`);

  // In production: this would connect to IHR runtime and stream events
  // For now, simulate a session lifecycle
  const simulateEvents = (): void => {
    const stages = ['plan_generated', 'task_delegated', 'tool_executed', 'validation_complete', 'report_generated'];
    let index = 0;

    const interval = setInterval(() => {
      if (index >= stages.length) {
        const endEvent = { type: 'session_end', sessionId, timestamp: new Date().toISOString() };
        res.write(`data: ${JSON.stringify(endEvent)}\n\n`);
        clearInterval(interval);
        res.end();

        const session = activeSessions.get(sessionId);
        if (session) session.status = 'completed';
        return;
      }

      const event = {
        id: uuid(),
        type: stages[index],
        sessionId,
        timestamp: new Date().toISOString(),
        data: { stage: stages[index], input },
      };

      activeSessions.get(sessionId)?.events.push(event);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      index++;
    }, 1000);

    req.on('close', () => {
      clearInterval(interval);
      const session = activeSessions.get(sessionId);
      if (session) session.status = 'disconnected';
    });
  };

  simulateEvents();
});

// ---- GET /sessions/:id/events ----

sessionsRouter.get('/:id/events', (req: AuthenticatedRequest, res) => {
  const session = activeSessions.get(req.params['id'] ?? '');
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send existing events
  for (const event of session.events) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  // Keep connection open for new events
  const interval = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// ---- GET /sessions (list active sessions) ----

sessionsRouter.get('/', (_req: AuthenticatedRequest, res) => {
  const sessions = Array.from(activeSessions.values()).map((s) => ({
    id: s.id,
    nlahId: s.nlahId,
    status: s.status,
    startedAt: s.startedAt,
    eventCount: s.events.length,
  }));

  res.json({ sessions });
});
