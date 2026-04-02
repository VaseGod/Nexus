// ============================================================================
// Constants
// ============================================================================

import type { PipelineStage } from './types/pipeline.js';
import type { SandboxConfig } from './types/security.js';
import type { CompactionOperation } from './types/memory.js';

export const PIPELINE_STAGES: readonly PipelineStage[] = [
  'PLAN',
  'DELEGATE',
  'EXECUTE',
  'VALIDATE',
  'REPORT',
] as const;

export const DEFAULT_SANDBOX_LIMITS: SandboxConfig = {
  cpuCores: 1,
  memoryMb: 512,
  wallTimeMs: 30_000,
  readOnlyPaths: ['/'],
  writablePaths: [],
  networkWhitelist: [],
  networkBlocked: true,
} as const;

export const DEFAULT_ULTRAPLAN_THRESHOLD = 0.4;

export const MAX_MEMORY_TOPICS = 10_000;

export const COMPACTION_OPERATIONS: readonly CompactionOperation[] = [
  'ADD',
  'UPDATE',
  'DELETE',
  'NOOP',
  'DEDUPLICATE',
] as const;
