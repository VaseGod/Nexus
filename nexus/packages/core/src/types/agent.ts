// ============================================================================
// Agent Types
// ============================================================================

export type AgentId = string;
export type SessionId = string;

export type AgentRole = 'parent' | 'child' | 'coordinator';

export interface AgentMessage {
  readonly id: string;
  readonly fromAgent: AgentId;
  readonly toAgent: AgentId;
  readonly timestamp: string;
  readonly payload: Record<string, unknown>;
  readonly messageType: 'task' | 'result' | 'error' | 'status';
}

export type AgentEventType =
  | 'session_start'
  | 'session_end'
  | 'plan_generated'
  | 'task_delegated'
  | 'tool_executed'
  | 'validation_complete'
  | 'report_generated'
  | 'fork_started'
  | 'join_completed'
  | 'security_alert'
  | 'memory_read'
  | 'memory_write'
  | 'error';

export interface AgentEvent {
  readonly id: string;
  readonly sessionId: SessionId;
  readonly agentId: AgentId;
  readonly type: AgentEventType;
  readonly timestamp: string;
  readonly data: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

export interface ForkEvent extends AgentEvent {
  readonly type: 'fork_started';
  readonly data: {
    readonly branchCount: number;
    readonly branchIds: string[];
    readonly parentContext: string;
  };
}

export interface JoinEvent extends AgentEvent {
  readonly type: 'join_completed';
  readonly data: {
    readonly winningBranchId: string;
    readonly scores: Record<string, number>;
    readonly totalDurationMs: number;
  };
}

export interface SecurityEvent extends AgentEvent {
  readonly type: 'security_alert';
  readonly data: {
    readonly alertType: 'trap_detected' | 'sandbox_violation' | 'anomaly_detected';
    readonly severity: 'low' | 'medium' | 'high' | 'critical';
    readonly description: string;
    readonly sourceAgent: AgentId;
  };
}

export interface UsageEvent {
  readonly sessionId: SessionId;
  readonly workspaceId: string;
  readonly timestamp: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly toolsExecuted: number;
  readonly frontierCalls: number;
  readonly edgeCalls: number;
  readonly workflowSuccess: boolean;
}

export interface UserInput {
  readonly sessionId: SessionId;
  readonly content: string;
  readonly attachments?: ReadonlyArray<{
    readonly type: string;
    readonly url: string;
  }>;
  readonly metadata?: Record<string, unknown>;
}
