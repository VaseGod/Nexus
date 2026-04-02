// ============================================================================
// Pipeline Types
// ============================================================================

import type { ExecutionStage } from './nlah.js';

export type PipelineStage = ExecutionStage;

export interface PipelineContext {
  readonly sessionId: string;
  readonly agentId: string;
  readonly currentStage: PipelineStage;
  readonly history: readonly PipelineStageResult[];
  readonly parentContext?: string;
  readonly startedAt: string;
}

export interface PipelineStageResult {
  readonly stage: PipelineStage;
  readonly success: boolean;
  readonly output: unknown;
  readonly durationMs: number;
  readonly timestamp: string;
}

export interface ScoringStrategy {
  readonly name: string;
  score(result: BranchResult): number;
}

export interface BranchResult {
  readonly branchId: string;
  readonly agentId: string;
  readonly status: 'fulfilled' | 'rejected';
  readonly output?: unknown;
  readonly error?: string;
  readonly durationMs: number;
  readonly toolsExecuted: number;
  readonly tokenUsage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
}
