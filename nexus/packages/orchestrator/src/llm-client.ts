// ============================================================================
// LLM Client — Provider-agnostic LLM interaction layer
// ============================================================================

import { Result, ok, err } from 'neverthrow';
import type {
  LLMClientInterface,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMMessage,
} from '@nexus/core';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'llm-client' });

interface ProviderConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly defaultModel: string;
}

export class LLMClient implements LLMClientInterface {
  public readonly provider: LLMProvider;
  private readonly config: ProviderConfig;

  constructor(provider: LLMProvider, config: ProviderConfig) {
    this.provider = provider;
    this.config = config;
  }

  public async complete(request: LLMRequest): Promise<LLMResponse> {
    logger.info(
      { provider: this.provider, model: request.model, messageCount: request.messages.length },
      'LLM completion request',
    );

    switch (this.provider) {
      case 'anthropic':
        return this.completeAnthropic(request);
      case 'openai':
        return this.completeOpenAI(request);
      case 'edge':
        return this.completeEdge(request);
      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  public async *stream(request: LLMRequest): AsyncGenerator<string> {
    const response = await this.complete({ ...request, stream: true });
    yield response.content;
  }

  // ---- Anthropic ----

  private async completeAnthropic(request: LLMRequest): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl ?? 'https://api.anthropic.com';
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const nonSystemMessages = request.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: request.model || this.config.defaultModel,
      max_tokens: request.maxTokens ?? 4096,
      messages: nonSystemMessages.map((m) => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content,
      })),
    };

    if (systemMessage) {
      body['system'] = systemMessage.content;
    }

    if (request.temperature !== undefined) {
      body['temperature'] = request.temperature;
    }

    if (request.tools && request.tools.length > 0) {
      body['tools'] = request.tools;
    }

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return this.parseAnthropicResponse(data);
  }

  private parseAnthropicResponse(data: Record<string, unknown>): LLMResponse {
    const content = Array.isArray(data['content'])
      ? (data['content'] as Array<{ type: string; text?: string }>)
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join('')
      : '';

    const usage = data['usage'] as { input_tokens?: number; output_tokens?: number } | undefined;

    return {
      id: (data['id'] as string) || '',
      provider: 'anthropic',
      model: (data['model'] as string) || '',
      content,
      usage: {
        promptTokens: usage?.input_tokens ?? 0,
        completionTokens: usage?.output_tokens ?? 0,
        totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
      },
      finishReason: data['stop_reason'] === 'tool_use' ? 'tool_calls' : 'stop',
    };
  }

  // ---- OpenAI ----

  private async completeOpenAI(request: LLMRequest): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com';

    const body: Record<string, unknown> = {
      model: request.model || this.config.defaultModel,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
      })),
      max_tokens: request.maxTokens ?? 4096,
    };

    if (request.temperature !== undefined) {
      body['temperature'] = request.temperature;
    }

    if (request.tools && request.tools.length > 0) {
      body['tools'] = request.tools;
    }

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return this.parseOpenAIResponse(data);
  }

  private parseOpenAIResponse(data: Record<string, unknown>): LLMResponse {
    const choices = data['choices'] as Array<{
      message?: { content?: string; tool_calls?: unknown[] };
      finish_reason?: string;
    }>;
    const choice = choices?.[0];
    const usage = data['usage'] as {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    } | undefined;

    return {
      id: (data['id'] as string) || '',
      provider: 'openai',
      model: (data['model'] as string) || '',
      content: choice?.message?.content ?? '',
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      finishReason: choice?.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop',
    };
  }

  // ---- Edge (OpenAI-compatible local model) ----

  private async completeEdge(request: LLMRequest): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl ?? 'http://localhost:8003';

    const body = {
      model: request.model || 'local',
      prompt: request.messages.map((m) => m.content).join('\n'),
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.7,
    };

    const response = await fetch(`${baseUrl}/v1/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge model error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const choices = data['choices'] as Array<{ text?: string }> | undefined;
    const usage = data['usage'] as {
      prompt_tokens?: number;
      completion_tokens?: number;
    } | undefined;

    return {
      id: (data['id'] as string) || '',
      provider: 'edge',
      model: 'local',
      content: choices?.[0]?.text ?? '',
      usage: {
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        totalTokens: (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0),
      },
      finishReason: 'stop',
    };
  }
}

// ---- Factory ----

export function createLLMClient(
  provider: LLMProvider,
  apiKey: string,
  baseUrl?: string,
): LLMClient {
  const defaults: Record<LLMProvider, string> = {
    anthropic: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    edge: 'local',
  };

  return new LLMClient(provider, {
    apiKey,
    baseUrl,
    defaultModel: defaults[provider],
  });
}
