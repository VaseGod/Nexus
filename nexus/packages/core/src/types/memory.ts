// ============================================================================
// Memory Types
// ============================================================================

export interface MemoryIndexEntry {
  readonly slug: string;
  readonly filePath: string;
  readonly summary: string;
  readonly lastUpdated: string; // ISO 8601
}

export interface MemoryTopic {
  readonly slug: string;
  readonly title: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface TranscriptLogEntry {
  readonly ts: string;
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly content: string;
  readonly toolCalls?: ReadonlyArray<{
    readonly name: string;
    readonly arguments: Record<string, unknown>;
    readonly result?: unknown;
  }>;
  readonly metadata?: Record<string, unknown>;
}

export type CompactionOperation = 'ADD' | 'UPDATE' | 'DELETE' | 'NOOP' | 'DEDUPLICATE';

export interface CompactionResult {
  readonly operation: CompactionOperation;
  readonly topicSlug: string;
  readonly timestamp: string;
  readonly diff?: string;
  readonly reason: string;
  readonly requiresHumanReview: boolean;
}
