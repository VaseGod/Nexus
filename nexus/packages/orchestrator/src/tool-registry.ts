// ============================================================================
// Tool Registry — Runtime tool registration, validation, and execution
// ============================================================================

import { z } from 'zod';
import { Result, ok, err } from 'neverthrow';
import type { ToolSchema, ToolExecutionResult, ToolRegistry, ToolHandler } from '@nexus/core';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'tool-registry' });

export class ToolRegistryImpl implements ToolRegistry {
  private readonly tools: Map<string, { schema: ToolSchema; handler: ToolHandler }> = new Map();

  public register(schema: ToolSchema, handler: ToolHandler): void {
    if (this.tools.has(schema.name)) {
      logger.warn({ toolName: schema.name }, 'Overwriting existing tool registration');
    }
    this.tools.set(schema.name, { schema, handler });
    logger.info({ toolName: schema.name }, 'Tool registered');
  }

  public get(name: string): ToolSchema | undefined {
    return this.tools.get(name)?.schema;
  }

  public list(): readonly ToolSchema[] {
    return Array.from(this.tools.values()).map((t) => t.schema);
  }

  public async execute(name: string, input: unknown): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        toolName: name,
        success: false,
        output: null,
        error: `Tool not found: ${name}`,
        durationMs: 0,
        sandboxed: false,
      };
    }

    // Validate input against schema
    const validationResult = tool.schema.inputSchema.safeParse(input);
    if (!validationResult.success) {
      logger.error({ toolName: name, errors: validationResult.error.issues }, 'Input validation failed');
      return {
        toolName: name,
        success: false,
        output: null,
        error: `Input validation failed: ${validationResult.error.message}`,
        durationMs: 0,
        sandboxed: false,
      };
    }

    const startTime = performance.now();
    try {
      const output = await Promise.race([
        tool.handler(validationResult.data),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Tool execution timed out')), tool.schema.timeoutMs),
        ),
      ]);

      const durationMs = Math.round(performance.now() - startTime);

      // Validate output against schema
      const outputValidation = tool.schema.outputSchema.safeParse(output);
      if (!outputValidation.success) {
        logger.warn(
          { toolName: name, errors: outputValidation.error.issues },
          'Output validation failed',
        );
      }

      logger.info({ toolName: name, durationMs }, 'Tool executed successfully');
      return {
        toolName: name,
        success: true,
        output,
        durationMs,
        sandboxed: false,
      };
    } catch (error) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMessage = error instanceof Error ? error.message : 'Unknown execution error';
      logger.error({ toolName: name, error: errorMessage, durationMs }, 'Tool execution failed');
      return {
        toolName: name,
        success: false,
        output: null,
        error: errorMessage,
        durationMs,
        sandboxed: false,
      };
    }
  }
}
