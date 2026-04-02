// ============================================================================
// NEXUS API — Express REST API exposing all packages as HTTP endpoints
// ============================================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { createLogger } from '@nexus/core';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { sessionsRouter } from './routes/sessions.js';
import { memoryRouter } from './routes/memory.js';
import { proxyRouter } from './routes/proxy.js';
import { daemonRouter } from './routes/daemon.js';
import { billingRouter } from './routes/billing.js';

const logger = createLogger({ service: 'api' });

const app = express();

// ---- Global middleware ----
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(pinoHttp({ logger }));

// ---- Health check (no auth) ----
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'nexus-api', timestamp: new Date().toISOString() });
});

// ---- Auth middleware ----
app.use(authMiddleware);

// ---- Mount routers ----
app.use('/sessions', sessionsRouter);
app.use('/memory', memoryRouter);
app.use('/', proxyRouter);            // /compaction/*, /edge/*, /speculative/*
app.use('/daemon', daemonRouter);
app.use('/billing', billingRouter);

// ---- Error handler (must be last) ----
app.use(errorHandler);

// ---- Start server ----
const PORT = parseInt(process.env['API_PORT'] ?? '3000', 10);
const HOST = process.env['API_HOST'] ?? '0.0.0.0';

app.listen(PORT, HOST, () => {
  logger.info({ port: PORT, host: HOST }, 'NEXUS API server started');
});

export { app };
