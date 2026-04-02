// ============================================================================
// Agents — Parent agent, child agent base classes, and tool registry
// ============================================================================

import { v4 as uuid } from 'uuid';
import { Result, ok, err } from 'neverthrow';
import type {
  AgentId,
  AgentRole,
  AgentMessage,
  AgentEvent,
  SessionId,
  UserInput,
} from '@nexus/core';
import { createLogger } from '@nexus/core';
import { LLMClient } from '@nexus/orchestrator';
import { ToolRegistryImpl } from '@nexus/orchestrator';

const logger = createLogger({ service: 'agents' });

// ============================================================================
// Abstract Base Agent
// ============================================================================

export abstract class BaseAgent {
  public readonly id: AgentId;
  public readonly role: AgentRole;
  protected readonly llmClient: LLMClient;
  protected readonly toolRegistry: ToolRegistryImpl;
  protected readonly sessionId: SessionId;

  constructor(config: {
    role: AgentRole;
    llmClient: LLMClient;
    toolRegistry: ToolRegistryImpl;
    sessionId: SessionId;
    id?: AgentId;
  }) {
    this.id = config.id ?? `${config.role}-${uuid().slice(0, 8)}`;
    this.role = config.role;
    this.llmClient = config.llmClient;
    this.toolRegistry = config.toolRegistry;
    this.sessionId = config.sessionId;
  }

  abstract execute(input: string): Promise<Result<Record<string, unknown>, Error>>;

  protected createMessage(
    toAgent: AgentId,
    payload: Record<string, unknown>,
    messageType: AgentMessage['messageType'],
  ): AgentMessage {
    return {
      id: uuid(),
      fromAgent: this.id,
      toAgent,
      timestamp: new Date().toISOString(),
      payload,
      messageType,
    };
  }
}

// ============================================================================
// Parent Agent
// ============================================================================

export class ParentAgent extends BaseAgent {
  private readonly children: Map<AgentId, ChildAgent> = new Map();
  private readonly messageQueue: AgentMessage[] = [];

  constructor(config: {
    llmClient: LLMClient;
    toolRegistry: ToolRegistryImpl;
    sessionId: SessionId;
  }) {
    super({ ...config, role: 'parent' });
  }

  public spawnChild(config: {
    llmClient: LLMClient;
    toolRegistry: ToolRegistryImpl;
    taskDescription: string;
  }): ChildAgent {
    const child = new ChildAgent({
      llmClient: config.llmClient,
      toolRegistry: config.toolRegistry,
      sessionId: this.sessionId,
      parentId: this.id,
      taskDescription: config.taskDescription,
    });
    this.children.set(child.id, child);
    logger.info({ parentId: this.id, childId: child.id }, 'Child agent spawned');
    return child;
  }

  public async delegateToChild(
    childId: AgentId,
    task: string,
  ): Promise<Result<Record<string, unknown>, Error>> {
    const child = this.children.get(childId);
    if (!child) {
      return err(new Error(`Child agent not found: ${childId}`));
    }

    const message = this.createMessage(childId, { task }, 'task');
    this.messageQueue.push(message);

    return child.execute(task);
  }

  public async execute(input: string): Promise<Result<Record<string, unknown>, Error>> {
    try {
      const response = await this.llmClient.complete({
        provider: this.llmClient.provider,
        model: '',
        messages: [
          {
            role: 'system',
            content: `You are a parent coordination agent. Analyze the input and determine if tasks should be delegated to child agents or executed directly.`,
          },
          { role: 'user', content: input },
        ],
        maxTokens: 4096,
      });

      return ok({
        agentId: this.id,
        role: this.role,
        response: response.content,
        childCount: this.children.size,
        usage: response.usage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Parent agent execution failed: ${message}`));
    }
  }

  public getChildren(): ReadonlyMap<AgentId, ChildAgent> {
    return this.children;
  }
}

// ============================================================================
// Child Agent
// ============================================================================

export class ChildAgent extends BaseAgent {
  private readonly parentId: AgentId;
  private readonly taskDescription: string;

  constructor(config: {
    llmClient: LLMClient;
    toolRegistry: ToolRegistryImpl;
    sessionId: SessionId;
    parentId: AgentId;
    taskDescription: string;
  }) {
    super({ ...config, role: 'child' });
    this.parentId = config.parentId;
    this.taskDescription = config.taskDescription;
  }

  public async execute(input: string): Promise<Result<Record<string, unknown>, Error>> {
    logger.info(
      { agentId: this.id, parentId: this.parentId },
      'Child agent executing task',
    );

    try {
      const response = await this.llmClient.complete({
        provider: this.llmClient.provider,
        model: '',
        messages: [
          {
            role: 'system',
            content: `You are a child agent assigned the following task: ${this.taskDescription}\n\nExecute the task using available tools and report results to the parent agent.`,
          },
          { role: 'user', content: input },
        ],
        maxTokens: 4096,
      });

      // Execute any tool calls
      const toolResults = [];
      if (response.toolCalls) {
        for (const call of response.toolCalls) {
          const result = await this.toolRegistry.execute(call.name, call.arguments);
          toolResults.push(result);
        }
      }

      return ok({
        agentId: this.id,
        parentId: this.parentId,
        role: this.role,
        response: response.content,
        toolResults,
        usage: response.usage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Child agent execution failed: ${message}`));
    }
  }

  // ChildAgent cannot call other ChildAgents — enforced by having no spawn/delegate methods
}

export { ParentAgent as default };
