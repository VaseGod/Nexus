// ============================================================================
// Billing Types
// ============================================================================

export interface WorkspaceLicense {
  readonly workspaceId: string;
  readonly tier: 'starter' | 'professional' | 'enterprise';
  readonly seatsIncluded: number;
  readonly monthlyFee: number;
  readonly currency: string;
  readonly startDate: string;
  readonly endDate?: string;
  readonly stripeCustomerId: string;
  readonly stripeSubscriptionId?: string;
}

export interface UsageRecord {
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly timestamp: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly toolsExecuted: number;
  readonly frontierCalls: number;
  readonly edgeCalls: number;
  readonly workflowSuccess: boolean;
  readonly computeUnits: number;
}

export interface BillingPeriod {
  readonly workspaceId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly totalComputeUnits: number;
  readonly totalSuccessfulWorkflows: number;
  readonly baseFee: number;
  readonly variableFee: number;
  readonly outcomeFee: number;
  readonly totalAmount: number;
}

export interface InvoiceData {
  readonly invoiceId: string;
  readonly workspaceId: string;
  readonly billingPeriod: BillingPeriod;
  readonly stripeInvoiceId: string;
  readonly status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  readonly createdAt: string;
  readonly paidAt?: string;
}
