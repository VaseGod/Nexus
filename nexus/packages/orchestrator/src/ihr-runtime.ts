// ============================================================================
// IHR Runtime — Intelligent Hierarchical Reasoning execution pipeline
// PLAN → DELEGATE → EXECUTE → VALIDATE → REPORT
// ============================================================================

import { v4 as uuid } from 'uuid';
import { Result, ok, err } from 'neverthrow';
import type {
  AgentEvent,
  AgentEventType,
  UserInput,
  NLAH,
  PipelineStage,
  PipelineContext,
  SessionId,
  AgentId,
} from '@nexus/core';
import { createLogger, PIPELINE_STAGES } from '@nexus/core';
import { loadNLAH } from './nlah-loader.js';
import { AgentEventBus } from './event-bus.js';
import { LLMClient } from './llm-client.js';
import { ToolRegistryImpl } from './tool-registry.js';

const logger = createLogger({ service: 'ihr-runtime' });

interface IHRConfig {
  readonly llmClient: LLMClient;
  readonly eventBus: AgentEventBus;
  readonly toolRegistry: ToolRegistryImpl;
  readonly maxIterations: number;
}

interface StageResult {
  readonly stage: PipelineStage;
  readonly output: Record<string, unknown>;
  readonly success: boolean;
  readonly durationMs: number;
}

export class IHRRuntime {
  private readonly config: IHRConfig;

  constructor(config: IHRConfig) {
    this.config = config;
  }

  public async *runSession(
    nlahId: string,
    input: UserInput,
  ): AsyncGenerator<AgentEvent> {
    const sessionId = input.sessionId || uuid();
    const agentId = `parent-${uuid().slice(0, 8)}`;

    logger.info({ sessionId, nlahId }, 'Starting IHR session');

    // Emit session start
    yield this.createEvent(sessionId, agentId, 'session_start', {
      nlahId,
      input: input.content,
    });

    // Load NLAH SOP
    const nlahResult = await loadNLAH(nlahId);
    if (nlahResult.isErr()) {
      yield this.createEvent(sessionId, agentId, 'error', {
        error: nlahResult.error.message,
        phase: 'nlah_loading',
      });
      return;
    }

    const nlah = nlahResult.value;
    const context: PipelineContext = {
      sessionId,
      agentId,
      currentStage: 'PLAN',
      history: [],
      startedAt: new Date().toISOString(),
    };

    // Execute pipeline stages
    const stageResults: StageResult[] = [];

    for (const stage of nlah.frontmatter.execution_stages) {
      logger.info({ sessionId, stage }, 'Executing pipeline stage');

      const stageStart = performance.now();
      const stageResult = await this.executeStage(stage, context, nlah, input, stageResults);
      const stageDuration = Math.round(performance.now() - stageStart);

      const result: StageResult = {
        stage,
        output: stageResult,
        success: !stageResult['error'],
        durationMs: stageDuration,
      };

      stageResults.push(result);

      // Emit stage-specific event
      const eventType = this.stageToEventType(stage);
      yield this.createEvent(sessionId, agentId, eventType, {
        stage,
        output: stageResult,
        durationMs: stageDuration,
        success: result.success,
      });

      if (!result.success) {
        logger.error({ sessionId, stage, error: stageResult['error'] }, 'Stage failed');
        yield this.createEvent(sessionId, agentId, 'error', {
          stage,
          error: stageResult['error'],
        });
        break;
      }
    }

    // Emit session end
    yield this.createEvent(sessionId, agentId, 'session_end', {
      stageResults: stageResults.map((r) => ({
        stage: r.stage,
        success: r.success,
        durationMs: r.durationMs,
      })),
      totalDurationMs: stageResults.reduce((sum, r) => sum + r.durationMs, 0),
    });

    logger.info({ sessionId }, 'IHR session completed');
  }

  // ---- Pipeline Stage Execution ----

  private async executeStage(
    stage: PipelineStage,
    context: PipelineContext,
    nlah: NLAH,
    input: UserInput,
    previousResults: StageResult[],
  ): Promise<Record<string, unknown>> {
    const systemPrompt = this.buildSystemPrompt(stage, nlah, previousResults);
    const userPrompt = this.buildUserPrompt(stage, input, previousResults);

    try {
      const response = await this.config.llmClient.complete({
        provider: this.config.llmClient.provider,
        model: '',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: stage === 'PLAN' ? 0.3 : 0.5,
        maxTokens: 4096,
      });

      // If response includes tool calls, execute them
      if (response.toolCalls && response.toolCalls.length > 0) {
        const toolResults = [];
        for (const toolCall of response.toolCalls) {
          const result = await this.config.toolRegistry.execute(
            toolCall.name,
            toolCall.arguments,
          );
          toolResults.push(result);
        }
        return {
          content: response.content,
          toolResults,
          usage: response.usage,
        };
      }

      return {
        content: response.content,
        usage: response.usage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { error: errorMessage };
    }
  }

  // ---- Prompt Construction ----

  private buildSystemPrompt(
    stage: PipelineStage,
    nlah: NLAH,
    previousResults: StageResult[],
  ): string {
    const stageInstructions: Record<PipelineStage, string> = {
      PLAN: `You are in the PLAN stage. Analyze the user's request and create a detailed execution plan.
Consider available tools: ${nlah.frontmatter.tools.join(', ')}.
Output a structured JSON plan with steps, dependencies, and estimated complexity.`,

      DELEGATE: `You are in the DELEGATE stage. Based on the plan, determine which subtasks should be delegated to child agents.
Each child agent should receive a clear, self-contained task description.
Output a JSON array of delegation tasks.`,

      EXECUTE: `You are in the EXECUTE stage. Execute the plan using the available tools.
Call tools as needed to accomplish each step.
Report results for each step.`,

      VALIDATE: `You are in the VALIDATE stage. Review the execution results and verify correctness.
Check for errors, incomplete results, and quality issues.
Output a validation report with pass/fail for each step.`,

      REPORT: `You are in the REPORT stage. Synthesize all results into a final report.
Include summary, detailed results, any issues encountered, and recommendations.`,
    };

    return `${nlah.body}\n\n${stageInstructions[stage]}\n\nError taxonomy: ${nlah.frontmatter.error_taxonomy.join(', ')}`;
  }

  private buildUserPrompt(
    stage: PipelineStage,
    input: UserInput,
    previousResults: StageResult[],
  ): string {
    const contextSummary = previousResults
      .map((r) => `[${r.stage}] ${r.success ? 'SUCCESS' : 'FAILED'}: ${JSON.stringify(r.output).slice(0, 500)}`)
      .join('\n');

    return `User request: ${input.content}\n\n${
      contextSummary ? `Previous stages:\n${contextSummary}` : ''
    }`;
  }

  // ---- Helpers ----

  private stageToEventType(stage: PipelineStage): AgentEventType {
    const mapping: Record<PipelineStage, AgentEventType> = {
      PLAN: 'plan_generated',
      DELEGATE: 'task_delegated',
      EXECUTE: 'tool_executed',
      VALIDATE: 'validation_complete',
      REPORT: 'report_generated',
    };
    return mapping[stage];
  }

  private createEvent(
    sessionId: SessionId,
    agentId: AgentId,
    type: AgentEventType,
    data: Record<string, unknown>,
  ): AgentEvent {
    const event: AgentEvent = {
      id: uuid(),
      sessionId,
      agentId,
      type,
      timestamp: new Date().toISOString(),
      data,
    };

    this.config.eventBus.emit(event);
    return event;
  }
}
