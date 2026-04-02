// ============================================================================
// Orchestrator Tests — NLAH parsing, IHR pipeline, fork-join scoring
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NLAHSchema } from '../src/nlah-loader.js';
import { AgentEventBus } from '../src/event-bus.js';
import { ToolRegistryImpl } from '../src/tool-registry.js';
import { TaskSuccessScorer } from '../src/fork-join.js';
import type { BranchResult } from '@nexus/core';
import { z } from 'zod';

// ============================================================================
// NLAH Schema Validation Tests
// ============================================================================

describe('NLAHSchema', () => {
  it('should validate correct frontmatter', () => {
    const validData = {
      agent_id: 'code-review-agent',
      version: '1.0.0',
      tools: ['read_file', 'run_linter'],
      error_taxonomy: ['SyntaxError', 'LogicError'],
      execution_stages: ['PLAN', 'EXECUTE', 'REPORT'],
    };

    const result = NLAHSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agent_id).toBe('code-review-agent');
      expect(result.data.tools).toHaveLength(2);
      expect(result.data.execution_stages).toContain('PLAN');
    }
  });

  it('should reject invalid version format', () => {
    const invalidData = {
      agent_id: 'test',
      version: 'invalid',
      tools: ['tool1'],
      error_taxonomy: [],
      execution_stages: ['PLAN'],
    };

    const result = NLAHSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject empty tools array', () => {
    const invalidData = {
      agent_id: 'test',
      version: '1.0.0',
      tools: [],
      error_taxonomy: [],
      execution_stages: ['PLAN'],
    };

    const result = NLAHSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject invalid execution stage', () => {
    const invalidData = {
      agent_id: 'test',
      version: '1.0.0',
      tools: ['tool1'],
      error_taxonomy: [],
      execution_stages: ['INVALID_STAGE'],
    };

    const result = NLAHSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should reject missing agent_id', () => {
    const invalidData = {
      version: '1.0.0',
      tools: ['tool1'],
      error_taxonomy: [],
      execution_stages: ['PLAN'],
    };

    const result = NLAHSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Event Bus Tests
// ============================================================================

describe('AgentEventBus', () => {
  let eventBus: AgentEventBus;

  beforeEach(() => {
    eventBus = new AgentEventBus(100);
  });

  it('should emit and receive events', () => {
    const received: unknown[] = [];
    eventBus.on('session_start', (event) => received.push(event));

    eventBus.emit({
      id: 'evt-1',
      sessionId: 'ses-1',
      agentId: 'agent-1',
      type: 'session_start',
      timestamp: new Date().toISOString(),
      data: { test: true },
    });

    expect(received).toHaveLength(1);
  });

  it('should maintain event history', () => {
    eventBus.emit({
      id: 'evt-1',
      sessionId: 'ses-1',
      agentId: 'agent-1',
      type: 'session_start',
      timestamp: new Date().toISOString(),
      data: {},
    });

    eventBus.emit({
      id: 'evt-2',
      sessionId: 'ses-1',
      agentId: 'agent-1',
      type: 'plan_generated',
      timestamp: new Date().toISOString(),
      data: {},
    });

    expect(eventBus.getHistory()).toHaveLength(2);
    expect(eventBus.getHistory('ses-1')).toHaveLength(2);
    expect(eventBus.getHistory('ses-999')).toHaveLength(0);
  });

  it('should filter history by type', () => {
    for (let i = 0; i < 5; i++) {
      eventBus.emit({
        id: `evt-${i}`,
        sessionId: 'ses-1',
        agentId: 'agent-1',
        type: i % 2 === 0 ? 'tool_executed' : 'plan_generated',
        timestamp: new Date().toISOString(),
        data: {},
      });
    }

    expect(eventBus.getHistoryByType('tool_executed')).toHaveLength(3);
    expect(eventBus.getHistoryByType('plan_generated')).toHaveLength(2);
  });

  it('should respect max history limit', () => {
    const smallBus = new AgentEventBus(3);

    for (let i = 0; i < 5; i++) {
      smallBus.emit({
        id: `evt-${i}`,
        sessionId: 'ses-1',
        agentId: 'agent-1',
        type: 'tool_executed',
        timestamp: new Date().toISOString(),
        data: { index: i },
      });
    }

    expect(smallBus.getHistory()).toHaveLength(3);
  });

  it('should support wildcard listeners', () => {
    const allEvents: unknown[] = [];
    eventBus.on('*', (event) => allEvents.push(event));

    eventBus.emit({
      id: 'evt-1',
      sessionId: 'ses-1',
      agentId: 'agent-1',
      type: 'session_start',
      timestamp: new Date().toISOString(),
      data: {},
    });

    eventBus.emit({
      id: 'evt-2',
      sessionId: 'ses-1',
      agentId: 'agent-1',
      type: 'session_end',
      timestamp: new Date().toISOString(),
      data: {},
    });

    expect(allEvents).toHaveLength(2);
  });
});

// ============================================================================
// Tool Registry Tests
// ============================================================================

describe('ToolRegistryImpl', () => {
  let registry: ToolRegistryImpl;

  beforeEach(() => {
    registry = new ToolRegistryImpl();
  });

  it('should register and list tools', () => {
    registry.register(
      {
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: z.object({ input: z.string() }),
        outputSchema: z.object({ output: z.string() }),
        requiresNetwork: false,
        timeoutMs: 5000,
        allowedInSandbox: true,
      },
      async (input) => ({ output: `processed: ${(input as { input: string }).input}` }),
    );

    expect(registry.list()).toHaveLength(1);
    expect(registry.get('test-tool')).toBeDefined();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('should execute tool with valid input', async () => {
    registry.register(
      {
        name: 'add',
        description: 'Add numbers',
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        outputSchema: z.object({ sum: z.number() }),
        requiresNetwork: false,
        timeoutMs: 5000,
        allowedInSandbox: true,
      },
      async (input) => {
        const { a, b } = input as { a: number; b: number };
        return { sum: a + b };
      },
    );

    const result = await registry.execute('add', { a: 2, b: 3 });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ sum: 5 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should fail with invalid input', async () => {
    registry.register(
      {
        name: 'typed-tool',
        description: 'Typed tool',
        inputSchema: z.object({ value: z.string() }),
        outputSchema: z.any(),
        requiresNetwork: false,
        timeoutMs: 5000,
        allowedInSandbox: true,
      },
      async (input) => input,
    );

    const result = await registry.execute('typed-tool', { value: 123 }); // wrong type
    expect(result.success).toBe(false);
    expect(result.error).toContain('validation failed');
  });

  it('should return error for missing tool', async () => {
    const result = await registry.execute('nonexistent', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

// ============================================================================
// Fork-Join Scoring Tests
// ============================================================================

describe('TaskSuccessScorer', () => {
  const scorer = new TaskSuccessScorer();

  it('should give higher score to fulfilled branches', () => {
    const fulfilled: BranchResult = {
      branchId: 'b1',
      agentId: 'a1',
      status: 'fulfilled',
      output: { result: 'success' },
      durationMs: 500,
      toolsExecuted: 3,
      tokenUsage: { promptTokens: 100, completionTokens: 50 },
    };

    const rejected: BranchResult = {
      branchId: 'b2',
      agentId: 'a2',
      status: 'rejected',
      error: 'failed',
      durationMs: 1000,
      toolsExecuted: 0,
      tokenUsage: { promptTokens: 100, completionTokens: 0 },
    };

    expect(scorer.score(fulfilled)).toBeGreaterThan(scorer.score(rejected));
  });

  it('should prefer faster executions', () => {
    const fast: BranchResult = {
      branchId: 'b1',
      agentId: 'a1',
      status: 'fulfilled',
      durationMs: 100,
      toolsExecuted: 2,
      tokenUsage: { promptTokens: 100, completionTokens: 50 },
    };

    const slow: BranchResult = {
      branchId: 'b2',
      agentId: 'a2',
      status: 'fulfilled',
      durationMs: 50000,
      toolsExecuted: 2,
      tokenUsage: { promptTokens: 100, completionTokens: 50 },
    };

    expect(scorer.score(fast)).toBeGreaterThan(scorer.score(slow));
  });

  it('should reward tool usage', () => {
    const moreTools: BranchResult = {
      branchId: 'b1',
      agentId: 'a1',
      status: 'fulfilled',
      durationMs: 500,
      toolsExecuted: 4,
      tokenUsage: { promptTokens: 100, completionTokens: 50 },
    };

    const fewerTools: BranchResult = {
      branchId: 'b2',
      agentId: 'a2',
      status: 'fulfilled',
      durationMs: 500,
      toolsExecuted: 0,
      tokenUsage: { promptTokens: 100, completionTokens: 50 },
    };

    expect(scorer.score(moreTools)).toBeGreaterThan(scorer.score(fewerTools));
  });
});
