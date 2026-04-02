// ============================================================================
// Tool Types
// ============================================================================

import { z } from 'zod';

export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<unknown>;
  readonly outputSchema: z.ZodType<unknown>;
  readonly requiresNetwork: boolean;
  readonly timeoutMs: number;
  readonly allowedInSandbox: boolean;
}

export interface ToolExecutionResult {
  readonly toolName: string;
  readonly success: boolean;
  readonly output: unknown;
  readonly error?: string;
  readonly durationMs: number;
  readonly sandboxed: boolean;
}

export interface ToolRegistry {
  register(schema: ToolSchema, handler: ToolHandler): void;
  get(name: string): ToolSchema | undefined;
  list(): readonly ToolSchema[];
  execute(name: string, input: unknown): Promise<ToolExecutionResult>;
}

export type ToolHandler = (input: unknown) => Promise<unknown>;
