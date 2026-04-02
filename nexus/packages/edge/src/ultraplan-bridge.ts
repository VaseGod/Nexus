// ============================================================================
// ULTRAPLAN Bridge — escalation from edge to frontier model
// ============================================================================

import { v4 as uuid } from 'uuid';
import { Result, ok, err } from 'neverthrow';
import { createLogger, DEFAULT_ULTRAPLAN_THRESHOLD } from '@nexus/core';

const logger = createLogger({ service: 'ultraplan-bridge' });

interface UltraplanBlueprint {
  readonly id: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly executionState: Record<string, unknown>;
  readonly pendingTasks: readonly string[];
  readonly contextSnapshot: string;
  readonly createdAt: string;
}

interface UltraplanResult {
  readonly blueprintId: string;
  readonly executionPlan: Record<string, unknown>;
  readonly steps: readonly UltraplanStep[];
  readonly estimatedDurationMs: number;
  readonly latencyMs: number;
}

interface UltraplanStep {
  readonly id: string;
  readonly description: string;
  readonly toolCalls: readonly { name: string; arguments: Record<string, unknown> }[];
  readonly dependencies: readonly string[];
}

interface BridgeConfig {
  readonly anthropicApiKey: string;
  readonly anthropicBaseUrl: string;
  readonly threshold: number;
  readonly timeoutMs: number;
}

export class UltraplanBridge {
  private readonly config: BridgeConfig;

  constructor(config: Partial<BridgeConfig> & { anthropicApiKey: string }) {
    this.config = {
      anthropicApiKey: config.anthropicApiKey,
      anthropicBaseUrl: config.anthropicBaseUrl ?? 'https://api.anthropic.com',
      threshold: config.threshold ?? DEFAULT_ULTRAPLAN_THRESHOLD,
      timeoutMs: config.timeoutMs ?? 30 * 60 * 1000, // 30 minutes
    };
  }

  public shouldEscalate(confidence: number): boolean {
    return confidence < this.config.threshold;
  }

  public async escalate(
    sessionId: string,
    agentId: string,
    executionState: Record<string, unknown>,
    pendingTasks: readonly string[],
    contextSnapshot: string,
  ): Promise<Result<UltraplanResult, Error>> {
    const startTime = performance.now();

    const blueprint: UltraplanBlueprint = {
      id: uuid(),
      sessionId,
      agentId,
      executionState,
      pendingTasks,
      contextSnapshot,
      createdAt: new Date().toISOString(),
    };

    logger.info(
      { blueprintId: blueprint.id, sessionId, taskCount: pendingTasks.length },
      'Escalating to frontier model via ULTRAPLAN bridge',
    );

    try {
      const response = await fetch(`${this.config.anthropicBaseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          system: this.buildSystemPrompt(),
          messages: [
            {
              role: 'user',
              content: JSON.stringify(blueprint, null, 2),
            },
          ],
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Frontier API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const content = Array.isArray(data['content'])
        ? (data['content'] as Array<{ text?: string }>)
            .map((c) => c.text ?? '')
            .join('')
        : '';

      const latencyMs = Math.round(performance.now() - startTime);

      // Parse the returned execution plan
      let executionPlan: Record<string, unknown>;
      let steps: UltraplanStep[];

      try {
        const parsed = JSON.parse(content) as {
          plan?: Record<string, unknown>;
          steps?: UltraplanStep[];
        };
        executionPlan = parsed.plan ?? { raw: content };
        steps = parsed.steps ?? [];
      } catch {
        executionPlan = { raw: content };
        steps = [];
      }

      const result: UltraplanResult = {
        blueprintId: blueprint.id,
        executionPlan,
        steps,
        estimatedDurationMs: steps.length * 5000,
        latencyMs,
      };

      logger.info(
        { blueprintId: blueprint.id, latencyMs, stepCount: steps.length },
        'ULTRAPLAN bridge round-trip completed',
      );

      return ok(result);
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startTime);
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        { blueprintId: blueprint.id, latencyMs, error: message },
        'ULTRAPLAN bridge failed',
      );
      return err(new Error(`ULTRAPLAN escalation failed: ${message}`));
    }
  }

  private buildSystemPrompt(): string {
    return `You are the NEXUS ULTRAPLAN frontier planning engine.

You will receive a serialized UltraplanBlueprint JSON containing:
- Current execution state of a local edge agent
- Pending tasks that the edge agent could not resolve
- Context snapshot of the session

Your job is to create a detailed execution plan that the local edge agents can implement.

Respond with a JSON object containing:
{
  "plan": {
    "summary": "High-level plan description",
    "strategy": "The approach to solve the pending tasks"
  },
  "steps": [
    {
      "id": "step-1",
      "description": "Description of what to do",
      "toolCalls": [
        { "name": "tool_name", "arguments": { "key": "value" } }
      ],
      "dependencies": []
    }
  ]
}

Be specific, actionable, and provide concrete tool call arguments where possible.`;
  }
}
