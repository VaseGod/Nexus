// ============================================================================
// NLAH Loader — Reads & validates Markdown SOP files
// ============================================================================

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import matter from 'gray-matter';
import { z } from 'zod';
import { Result, ok, err } from 'neverthrow';
import type { NLAH, NLAHFrontmatter, ExecutionStage } from '@nexus/core';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'nlah-loader' });

// ---- Zod Schema ----

const ExecutionStageSchema = z.enum(['PLAN', 'DELEGATE', 'EXECUTE', 'VALIDATE', 'REPORT']);

const NLAHFrontmatterSchema = z.object({
  agent_id: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  tools: z.array(z.string()).min(1),
  error_taxonomy: z.array(z.string()),
  execution_stages: z.array(ExecutionStageSchema).min(1),
});

export const NLAHSchema = NLAHFrontmatterSchema;

// ---- Public API ----

const NLAH_DIR = join(process.cwd(), 'nlah');

export async function loadNLAH(agentId: string): Promise<Result<NLAH, Error>> {
  try {
    const filePath = await resolveNLAHFile(agentId);
    if (!filePath) {
      return err(new Error(`NLAH SOP not found for agent_id: ${agentId}`));
    }

    const raw = await readFile(filePath, 'utf-8');
    const { data, content } = matter(raw);

    const parseResult = NLAHFrontmatterSchema.safeParse(data);
    if (!parseResult.success) {
      logger.error({ errors: parseResult.error.issues, agentId }, 'NLAH schema validation failed');
      return err(new Error(`Invalid NLAH frontmatter: ${parseResult.error.message}`));
    }

    const frontmatter: NLAHFrontmatter = {
      agent_id: parseResult.data.agent_id,
      version: parseResult.data.version,
      tools: parseResult.data.tools,
      error_taxonomy: parseResult.data.error_taxonomy,
      execution_stages: parseResult.data.execution_stages as ExecutionStage[],
    };

    const nlah: NLAH = {
      frontmatter,
      body: content.trim(),
      rawMarkdown: raw,
      filePath,
      loadedAt: new Date().toISOString(),
    };

    logger.info({ agentId, version: frontmatter.version }, 'NLAH SOP loaded successfully');
    return ok(nlah);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error loading NLAH';
    logger.error({ error, agentId }, 'Failed to load NLAH SOP');
    return err(new Error(message));
  }
}

// ---- Internal helpers ----

async function resolveNLAHFile(agentId: string): Promise<string | undefined> {
  try {
    const files = await readdir(NLAH_DIR);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = join(NLAH_DIR, file);
      const raw = await readFile(filePath, 'utf-8');
      const { data } = matter(raw);
      if (data && typeof data === 'object' && 'agent_id' in data && data.agent_id === agentId) {
        return filePath;
      }
    }
    return undefined;
  } catch {
    logger.warn({ agentId }, 'NLAH directory not found or unreadable');
    return undefined;
  }
}
