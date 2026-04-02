// ============================================================================
// Fork-Join Execution Engine — parallel branch execution with scoring
// ============================================================================

import { v4 as uuid } from 'uuid';
import type {
  AgentEvent,
  BranchResult,
  ScoringStrategy,
  ForkEvent,
  JoinEvent,
  SessionId,
  AgentId,
} from '@nexus/core';
import { createLogger } from '@nexus/core';
import { AgentEventBus } from './event-bus.js';
import { LLMClient } from './llm-client.js';

const logger = createLogger({ service: 'fork-join' });

interface Branch {
  readonly id: string;
  readonly description: string;
  readonly contextPrefix: string;
  readonly execute: () => Promise<BranchResult>;
}

interface ForkJoinConfig {
  readonly eventBus: AgentEventBus;
  readonly scoringStrategy: ScoringStrategy;
  readonly sessionId: SessionId;
  readonly parentAgentId: AgentId;
}

export class ForkJoinEngine {
  private readonly config: ForkJoinConfig;

  constructor(config: ForkJoinConfig) {
    this.config = config;
  }

  public async fork(branches: Branch[]): Promise<BranchResult> {
    const branchIds = branches.map((b) => b.id);

    logger.info(
      { sessionId: this.config.sessionId, branchCount: branches.length, branchIds },
      'Forking execution into branches',
    );

    // Emit fork event
    const forkEvent: ForkEvent = {
      id: uuid(),
      sessionId: this.config.sessionId,
      agentId: this.config.parentAgentId,
      type: 'fork_started',
      timestamp: new Date().toISOString(),
      data: {
        branchCount: branches.length,
        branchIds,
        parentContext: 'context-snapshot',
      },
    };
    this.config.eventBus.emit(forkEvent);

    // Execute all branches in parallel
    const startTime = performance.now();
    const results = await Promise.allSettled(branches.map((b) => b.execute()));

    const branchResults: BranchResult[] = results.map((result, index) => {
      const branch = branches[index]!;
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        branchId: branch.id,
        agentId: `child-${branch.id}`,
        status: 'rejected' as const,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        durationMs: Math.round(performance.now() - startTime),
        toolsExecuted: 0,
        tokenUsage: { promptTokens: 0, completionTokens: 0 },
      };
    });

    // Score and rank results
    return this.join(branchResults, startTime);
  }

  private join(branchResults: BranchResult[], startTime: number): BranchResult {
    const scores: Record<string, number> = {};

    for (const result of branchResults) {
      scores[result.branchId] = this.config.scoringStrategy.score(result);
    }

    // Find the winning branch
    let winningBranch = branchResults[0]!;
    let highestScore = -Infinity;

    for (const result of branchResults) {
      const score = scores[result.branchId]!;
      if (score > highestScore) {
        highestScore = score;
        winningBranch = result;
      }
    }

    const totalDurationMs = Math.round(performance.now() - startTime);

    logger.info(
      {
        sessionId: this.config.sessionId,
        winningBranchId: winningBranch.branchId,
        scores,
        totalDurationMs,
      },
      'Join completed, winning branch selected',
    );

    // Emit join event
    const joinEvent: JoinEvent = {
      id: uuid(),
      sessionId: this.config.sessionId,
      agentId: this.config.parentAgentId,
      type: 'join_completed',
      timestamp: new Date().toISOString(),
      data: {
        winningBranchId: winningBranch.branchId,
        scores,
        totalDurationMs,
      },
    };
    this.config.eventBus.emit(joinEvent);

    return winningBranch;
  }
}

// ---- Default Scoring Strategy ----

export class TaskSuccessScorer implements ScoringStrategy {
  public readonly name = 'TaskSuccessScorer';

  public score(result: BranchResult): number {
    let score = 0;

    // Base score for successful execution
    if (result.status === 'fulfilled') {
      score += 100;
    }

    // Bonus for efficiency (fewer tokens = better)
    const totalTokens = result.tokenUsage.promptTokens + result.tokenUsage.completionTokens;
    if (totalTokens > 0) {
      score += Math.max(0, 50 - totalTokens / 100);
    }

    // Bonus for speed (faster = better)
    if (result.durationMs > 0) {
      score += Math.max(0, 30 - result.durationMs / 1000);
    }

    // Bonus for tool usage (more tools = more thorough)
    score += Math.min(20, result.toolsExecuted * 5);

    return score;
  }
}
