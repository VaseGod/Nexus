// ============================================================================
// Skeptical Memory Module — verification pipeline for memory writes
// ============================================================================

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import { Result, ok, err } from 'neverthrow';
import type { VerificationResult, QuarantineEntry } from '@nexus/core';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'skeptical-memory' });

const DEFAULT_ANOMALY_THRESHOLD = 0.7;

interface SkepticalMemoryConfig {
  readonly memoryBasePath: string;
  readonly anomalyThreshold: number;
  readonly embeddingServiceUrl: string;
}

export class SkepticalMemory {
  private readonly config: SkepticalMemoryConfig;
  private readonly quarantineDir: string;

  constructor(config: Partial<SkepticalMemoryConfig> & { memoryBasePath: string }) {
    this.config = {
      memoryBasePath: config.memoryBasePath,
      anomalyThreshold: config.anomalyThreshold ?? DEFAULT_ANOMALY_THRESHOLD,
      embeddingServiceUrl: config.embeddingServiceUrl ?? 'http://localhost:8001',
    };
    this.quarantineDir = join(this.config.memoryBasePath, 'quarantine');
  }

  public async verify(
    topicSlug: string,
    newContent: string,
  ): Promise<Result<VerificationResult, Error>> {
    try {
      logger.info({ topicSlug }, 'Running verification pipeline');

      // Step 1: Cross-reference against existing topics for contradictions
      const contradictions = await this.findContradictions(topicSlug, newContent);

      // Step 2: Semantic anomaly detection
      const anomalyScore = await this.detectAnomaly(newContent);

      // Step 3: Determine if flagging is needed
      const flaggedForReview =
        anomalyScore > this.config.anomalyThreshold || contradictions.length > 0;

      const result: VerificationResult = {
        passed: !flaggedForReview,
        anomalyScore,
        contradictions,
        flaggedForReview,
        reason: flaggedForReview
          ? `Anomaly score: ${anomalyScore.toFixed(3)}, contradictions: ${contradictions.length}`
          : 'All checks passed',
      };

      if (flaggedForReview) {
        await this.quarantine(topicSlug, newContent, result);
      }

      logger.info(
        { topicSlug, passed: result.passed, anomalyScore, contradictions: contradictions.length },
        'Verification pipeline completed',
      );

      return ok(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Verification failed: ${message}`));
    }
  }

  public async getQuarantineQueue(): Promise<Result<QuarantineEntry[], Error>> {
    try {
      await mkdir(this.quarantineDir, { recursive: true });
      const files = await readdir(this.quarantineDir);
      const entries: QuarantineEntry[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const raw = await readFile(join(this.quarantineDir, file), 'utf-8');
        entries.push(JSON.parse(raw) as QuarantineEntry);
      }

      return ok(entries.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Failed to read quarantine queue: ${message}`));
    }
  }

  public async reviewQuarantineEntry(
    entryId: string,
    decision: 'approve' | 'reject' | 'modify',
    reviewedBy: string,
  ): Promise<Result<void, Error>> {
    try {
      const filePath = join(this.quarantineDir, `${entryId}.json`);
      const raw = await readFile(filePath, 'utf-8');
      const entry = JSON.parse(raw) as QuarantineEntry;

      const updated: QuarantineEntry = {
        ...entry,
        reviewedAt: new Date().toISOString(),
        reviewedBy,
        decision,
        auditTrail: [...entry.auditTrail, `${decision} by ${reviewedBy} at ${new Date().toISOString()}`],
      };

      await writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
      logger.info({ entryId, decision, reviewedBy }, 'Quarantine entry reviewed');
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Review failed: ${message}`));
    }
  }

  // ---- Internal pipeline steps ----

  private async findContradictions(topicSlug: string, newContent: string): Promise<string[]> {
    const contradictions: string[] = [];
    const topicsDir = join(this.config.memoryBasePath, 'topics');

    try {
      const files = await readdir(topicsDir);
      const newContentLower = newContent.toLowerCase();

      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const existingContent = await readFile(join(topicsDir, file), 'utf-8');
        const existingContentLower = existingContent.toLowerCase();

        // Simple contradiction detection: look for negation patterns
        const negationPatterns = [
          { positive: /is (\w+)/gi, negative: /is not \1/gi },
          { positive: /should (\w+)/gi, negative: /should not \1/gi },
          { positive: /always (\w+)/gi, negative: /never \1/gi },
        ];

        for (const pattern of negationPatterns) {
          const positiveMatches = newContentLower.match(pattern.positive);
          const negativeInExisting = existingContentLower.match(pattern.negative);

          if (positiveMatches && negativeInExisting) {
            contradictions.push(
              `Potential contradiction in ${file}: new content asserts "${positiveMatches[0]}" but existing content states "${negativeInExisting[0]}"`,
            );
          }
        }

        // Check for direct value contradictions
        const valuePattern = /(\w+)\s*(?:is|=|:)\s*(\w+)/gi;
        const newValues = new Map<string, string>();
        let match: RegExpExecArray | null;

        while ((match = valuePattern.exec(newContentLower)) !== null) {
          if (match[1] && match[2]) {
            newValues.set(match[1], match[2]);
          }
        }

        const existingValuePattern = /(\w+)\s*(?:is|=|:)\s*(\w+)/gi;
        while ((match = existingValuePattern.exec(existingContentLower)) !== null) {
          if (match[1] && match[2]) {
            const newValue = newValues.get(match[1]);
            if (newValue && newValue !== match[2] && match[1].length > 2) {
              contradictions.push(
                `Value conflict in ${file}: "${match[1]}" is "${match[2]}" vs new "${newValue}"`,
              );
            }
          }
        }
      }
    } catch {
      // Topics directory may not exist yet
    }

    return contradictions;
  }

  private async detectAnomaly(content: string): Promise<number> {
    try {
      const response = await fetch(`${this.config.embeddingServiceUrl}/anomaly-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        const data = (await response.json()) as { score: number };
        return data.score;
      }
    } catch {
      // Embedding service unavailable
    }

    // Fallback: heuristic anomaly detection
    return this.heuristicAnomalyScore(content);
  }

  private heuristicAnomalyScore(content: string): number {
    let score = 0;

    // Check for suspicious patterns
    if (content.includes('sudo') || content.includes('chmod 777')) score += 0.3;
    if (content.includes('rm -rf') || content.includes('DELETE FROM')) score += 0.3;
    if (/https?:\/\/\d+\.\d+\.\d+\.\d+/.test(content)) score += 0.2;
    if (content.includes('base64') && content.length > 1000) score += 0.2;
    if (/password\s*[:=]\s*\S+/i.test(content)) score += 0.3;
    if (/api[_-]?key\s*[:=]\s*\S+/i.test(content)) score += 0.3;

    return Math.min(1.0, score);
  }

  private async quarantine(
    topicSlug: string,
    content: string,
    result: VerificationResult,
  ): Promise<void> {
    await mkdir(this.quarantineDir, { recursive: true });

    const entry: QuarantineEntry = {
      id: uuid(),
      topicSlug,
      content,
      anomalyScore: result.anomalyScore,
      contradictions: result.contradictions,
      submittedAt: new Date().toISOString(),
      auditTrail: [`Quarantined at ${new Date().toISOString()} — ${result.reason}`],
    };

    await writeFile(
      join(this.quarantineDir, `${entry.id}.json`),
      JSON.stringify(entry, null, 2),
      'utf-8',
    );

    logger.warn(
      { entryId: entry.id, topicSlug, anomalyScore: result.anomalyScore },
      'Content quarantined for human review',
    );
  }
}
