// ============================================================================
// NLAH (Natural Language Agent Handbook) Types
// ============================================================================

export type ExecutionStage = 'PLAN' | 'DELEGATE' | 'EXECUTE' | 'VALIDATE' | 'REPORT';

export interface NLAHFrontmatter {
  readonly agent_id: string;
  readonly version: string;
  readonly tools: readonly string[];
  readonly error_taxonomy: readonly string[];
  readonly execution_stages: readonly ExecutionStage[];
}

export interface NLAH {
  readonly frontmatter: NLAHFrontmatter;
  readonly body: string;
  readonly rawMarkdown: string;
  readonly filePath: string;
  readonly loadedAt: string;
}
