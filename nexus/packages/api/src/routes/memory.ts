// ============================================================================
// Memory Router — MEMORY.md index, topics, search
// ============================================================================

import { Router } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { MemoryIndex } from '@nexus/memory';
import { TopicStore } from '@nexus/memory';

export const memoryRouter = Router();

const MEMORY_BASE_PATH = process.env['MEMORY_BASE_PATH'] ?? './memory';
const memoryIndex = new MemoryIndex(MEMORY_BASE_PATH);
const topicStore = new TopicStore(MEMORY_BASE_PATH);

// Initialize on first request
let initialized = false;
async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    await memoryIndex.load();
    await topicStore.initialize();
    initialized = true;
  }
}

// ---- GET /memory/index ----
memoryRouter.get('/index', async (_req: AuthenticatedRequest, res, next) => {
  try {
    await ensureInitialized();
    const entries = memoryIndex.getIndexAsArray();
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

// ---- GET /memory/topics/:slug ----
memoryRouter.get('/topics/:slug', async (req: AuthenticatedRequest, res, next) => {
  try {
    await ensureInitialized();
    const slug = req.params['slug'] ?? '';
    const result = await topicStore.fetchTopic(slug);

    if (result.isErr()) {
      res.status(404).json({ error: result.error.message });
      return;
    }

    res.json({ topic: result.value });
  } catch (error) {
    next(error);
  }
});

// ---- POST /memory/search ----
const SearchSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().default(5),
});

memoryRouter.post('/search', async (req: AuthenticatedRequest, res, next) => {
  try {
    await ensureInitialized();
    const parseResult = SearchSchema.safeParse(req.body);

    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.issues });
      return;
    }

    const { query, topK } = parseResult.data;
    const result = await topicStore.searchSimilar(query, topK);

    if (result.isErr()) {
      res.status(500).json({ error: result.error.message });
      return;
    }

    res.json({ results: result.value });
  } catch (error) {
    next(error);
  }
});
