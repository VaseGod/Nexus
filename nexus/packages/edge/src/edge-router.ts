// ============================================================================
// Edge Model Router — classifies tasks as EDGE or FRONTIER
// ============================================================================

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import { Result, ok, err } from 'neverthrow';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'edge-router' });

export type TaskClassification = 'EDGE' | 'FRONTIER';

interface RoutingDecision {
  readonly taskId: string;
  readonly classification: TaskClassification;
  readonly confidence: number;
  readonly reason: string;
  readonly timestamp: string;
}

// Tasks suitable for edge (local, fast) processing
const EDGE_PATTERNS: readonly RegExp[] = [
  /\b(classify|categorize|label)\b/i,
  /\b(search|find|lookup|query)\b/i,
  /\b(parse|extract|grep)\b/i,
  /\b(summarize|tldr|brief)\b/i,
  /\b(yes|no|true|false|boolean)\b/i,
  /\b(intent|route|dispatch)\b/i,
  /\b(log|format|transform)\b/i,
];

// Tasks requiring frontier (full, accurate) processing
const FRONTIER_PATTERNS: readonly RegExp[] = [
  /\b(architect|design|plan|strategy)\b/i,
  /\b(multi-step|complex|reason|analyze)\b/i,
  /\b(generate|create|build|implement)\b/i,
  /\b(ambiguous|judgment|decide|evaluate)\b/i,
  /\b(novel|creative|innovative)\b/i,
  /\b(refactor|restructure|redesign)\b/i,
  /\b(debug|diagnose|troubleshoot)\b/i,
];

export class EdgeRouter {
  private readonly logPath: string;
  private readonly edgeServerUrl: string;

  constructor(basePath: string, edgeServerUrl: string = 'http://localhost:8003') {
    this.logPath = join(basePath, 'edge-routing-log.jsonl');
    this.edgeServerUrl = edgeServerUrl;
  }

  public async classify(
    taskDescription: string,
  ): Promise<Result<RoutingDecision, Error>> {
    try {
      const { classification, confidence, reason } = this.ruleBasedClassify(taskDescription);

      // If rule-based is uncertain, try embedding-based classification
      let finalClassification = classification;
      let finalConfidence = confidence;
      let finalReason = reason;

      if (confidence < 0.6) {
        const embeddingResult = await this.embeddingClassify(taskDescription);
        if (embeddingResult) {
          finalClassification = embeddingResult.classification;
          finalConfidence = embeddingResult.confidence;
          finalReason = `${reason}; embedding: ${embeddingResult.reason}`;
        }
      }

      const decision: RoutingDecision = {
        taskId: uuid(),
        classification: finalClassification,
        confidence: finalConfidence,
        reason: finalReason,
        timestamp: new Date().toISOString(),
      };

      // Log decision asynchronously
      this.logDecision(decision).catch((e) => {
        logger.warn({ error: e }, 'Failed to log routing decision');
      });

      logger.info(
        { classification: finalClassification, confidence: finalConfidence },
        'Task classified',
      );

      return ok(decision);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Classification failed: ${message}`));
    }
  }

  private ruleBasedClassify(task: string): {
    classification: TaskClassification;
    confidence: number;
    reason: string;
  } {
    let edgeScore = 0;
    let frontierScore = 0;
    const matchedPatterns: string[] = [];

    for (const pattern of EDGE_PATTERNS) {
      if (pattern.test(task)) {
        edgeScore += 1;
        matchedPatterns.push(`edge:${pattern.source}`);
      }
    }

    for (const pattern of FRONTIER_PATTERNS) {
      if (pattern.test(task)) {
        frontierScore += 1;
        matchedPatterns.push(`frontier:${pattern.source}`);
      }
    }

    // Factor in task length — longer tasks tend to be more complex
    if (task.length > 500) {
      frontierScore += 0.5;
    }
    if (task.split('\n').length > 5) {
      frontierScore += 0.5;
    }

    const total = edgeScore + frontierScore;
    if (total === 0) {
      return {
        classification: 'FRONTIER',
        confidence: 0.5,
        reason: 'No pattern matches, defaulting to FRONTIER',
      };
    }

    const edgeRatio = edgeScore / total;

    if (edgeRatio > 0.6) {
      return {
        classification: 'EDGE',
        confidence: Math.min(0.95, 0.5 + edgeRatio * 0.5),
        reason: `Rule-based: ${matchedPatterns.join(', ')}`,
      };
    }

    return {
      classification: 'FRONTIER',
      confidence: Math.min(0.95, 0.5 + (1 - edgeRatio) * 0.5),
      reason: `Rule-based: ${matchedPatterns.join(', ')}`,
    };
  }

  private async embeddingClassify(
    task: string,
  ): Promise<{ classification: TaskClassification; confidence: number; reason: string } | null> {
    try {
      const response = await fetch(`${this.edgeServerUrl}/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: task }),
      });

      if (!response.ok) return null;

      const data = (await response.json()) as {
        classification: string;
        confidence: number;
      };

      return {
        classification: data.classification === 'EDGE' ? 'EDGE' : 'FRONTIER',
        confidence: data.confidence,
        reason: 'embedding-based classification',
      };
    } catch {
      return null;
    }
  }

  private async logDecision(decision: RoutingDecision): Promise<void> {
    await mkdir(join(this.logPath, '..'), { recursive: true });
    await appendFile(this.logPath, JSON.stringify(decision) + '\n', 'utf-8');
  }
}
