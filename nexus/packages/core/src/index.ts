// ============================================================================
// NEXUS Core — Shared Types, Interfaces, Constants
// ============================================================================

export { NexusConfig, loadConfig } from './config.js';
export { createLogger } from './logger.js';
export type { NexusLogger } from './logger.js';

// --- Result type re-export ---
export { Result, ok, err, ResultAsync, okAsync, errAsync } from 'neverthrow';
export type { Ok, Err } from 'neverthrow';

// --- Agent types ---
export type {
  AgentId,
  SessionId,
  AgentRole,
  AgentMessage,
  AgentEvent,
  AgentEventType,
  ForkEvent,
  JoinEvent,
  SecurityEvent,
  UsageEvent,
  UserInput,
} from './types/agent.js';

// --- Memory types ---
export type {
  MemoryTopic,
  MemoryIndexEntry,
  TranscriptLogEntry,
  CompactionOperation,
  CompactionResult,
} from './types/memory.js';

// --- LLM types ---
export type {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMMessage,
  LLMToolCall,
  LLMClientInterface,
} from './types/llm.js';

// --- Tool types ---
export type {
  ToolSchema,
  ToolExecutionResult,
  ToolRegistry,
} from './types/tool.js';

// --- NLAH types ---
export type {
  NLAH,
  NLAHFrontmatter,
  ExecutionStage,
} from './types/nlah.js';

// --- Billing types ---
export type {
  WorkspaceLicense,
  UsageRecord,
  BillingPeriod,
  InvoiceData,
} from './types/billing.js';

// --- Security types ---
export type {
  VerificationResult,
  QuarantineEntry,
  SandboxConfig,
  TrapPattern,
} from './types/security.js';

// --- Pipeline types ---
export type {
  PipelineStage,
  PipelineContext,
  ScoringStrategy,
  BranchResult,
} from './types/pipeline.js';

// --- Constants ---
export {
  PIPELINE_STAGES,
  DEFAULT_SANDBOX_LIMITS,
  DEFAULT_ULTRAPLAN_THRESHOLD,
  MAX_MEMORY_TOPICS,
  COMPACTION_OPERATIONS,
} from './constants.js';
