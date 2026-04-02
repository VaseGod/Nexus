// ============================================================================
// LLM Provider Types
// ============================================================================

export type LLMProvider = 'anthropic' | 'openai' | 'edge';

export interface LLMMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
  readonly name?: string;
  readonly toolCallId?: string;
}

export interface LLMToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

export interface LLMRequest {
  readonly provider: LLMProvider;
  readonly model: string;
  readonly messages: readonly LLMMessage[];
  readonly tools?: readonly Record<string, unknown>[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly stream?: boolean;
}

export interface LLMResponse {
  readonly id: string;
  readonly provider: LLMProvider;
  readonly model: string;
  readonly content: string;
  readonly toolCalls?: readonly LLMToolCall[];
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
  readonly finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface LLMClientInterface {
  readonly provider: LLMProvider;
  complete(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest): AsyncGenerator<string>;
}
