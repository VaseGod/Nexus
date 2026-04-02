// ============================================================================
// Security Types
// ============================================================================

export interface VerificationResult {
  readonly passed: boolean;
  readonly anomalyScore: number;
  readonly contradictions: readonly string[];
  readonly flaggedForReview: boolean;
  readonly reason?: string;
}

export interface QuarantineEntry {
  readonly id: string;
  readonly topicSlug: string;
  readonly content: string;
  readonly anomalyScore: number;
  readonly contradictions: readonly string[];
  readonly submittedAt: string;
  readonly reviewedAt?: string;
  readonly reviewedBy?: string;
  readonly decision?: 'approve' | 'reject' | 'modify';
  readonly auditTrail: readonly string[];
}

export interface SandboxConfig {
  readonly cpuCores: number;
  readonly memoryMb: number;
  readonly wallTimeMs: number;
  readonly readOnlyPaths: readonly string[];
  readonly writablePaths: readonly string[];
  readonly networkWhitelist: readonly string[];
  readonly networkBlocked: boolean;
}

export interface TrapPattern {
  readonly id: string;
  readonly name: string;
  readonly category: 'exfiltration' | 'privilege_escalation' | 'injection' | 'evasion';
  readonly regexPattern: string;
  readonly semanticDescription: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
}
