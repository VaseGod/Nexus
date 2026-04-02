// ============================================================================
// Billing Service — hybrid seat license + usage metering + Stripe integration
// ============================================================================

import Stripe from 'stripe';
import { v4 as uuid } from 'uuid';
import { Result, ok, err } from 'neverthrow';
import type {
  WorkspaceLicense,
  UsageRecord,
  BillingPeriod,
  InvoiceData,
  UsageEvent,
} from '@nexus/core';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'billing' });

// ============================================================================
// Configuration
// ============================================================================

interface BillingConfig {
  readonly stripeSecretKey: string;
  readonly baseRate: number;     // per compute unit
  readonly outcomeFee: number;   // per successful workflow
}

const TIER_PRICING: Record<WorkspaceLicense['tier'], { seats: number; monthlyFee: number }> = {
  starter: { seats: 5, monthlyFee: 4900 },       // $49/month
  professional: { seats: 25, monthlyFee: 19900 }, // $199/month
  enterprise: { seats: 100, monthlyFee: 49900 },  // $499/month
};

// ============================================================================
// Billing Service
// ============================================================================

export class BillingService {
  private readonly stripe: Stripe;
  private readonly config: BillingConfig;
  private readonly licenses: Map<string, WorkspaceLicense> = new Map();
  private readonly usageRecords: Map<string, UsageRecord[]> = new Map();

  constructor(config: BillingConfig) {
    this.config = config;
    this.stripe = new Stripe(config.stripeSecretKey, { apiVersion: '2024-04-10' as Stripe.LatestApiVersion });
  }

  // ---- License Management ----

  public async createLicense(
    workspaceId: string,
    tier: WorkspaceLicense['tier'],
    stripeCustomerId: string,
  ): Promise<Result<WorkspaceLicense, Error>> {
    const pricing = TIER_PRICING[tier];

    const license: WorkspaceLicense = {
      workspaceId,
      tier,
      seatsIncluded: pricing.seats,
      monthlyFee: pricing.monthlyFee,
      currency: 'usd',
      startDate: new Date().toISOString(),
      stripeCustomerId,
    };

    this.licenses.set(workspaceId, license);
    logger.info({ workspaceId, tier }, 'License created');

    return ok(license);
  }

  public getLicense(workspaceId: string): Result<WorkspaceLicense, Error> {
    const license = this.licenses.get(workspaceId);
    if (!license) {
      return err(new Error(`License not found for workspace: ${workspaceId}`));
    }
    return ok(license);
  }

  // ---- Usage Metering ----

  public recordUsage(event: UsageEvent): Result<UsageRecord, Error> {
    const computeUnits = this.calculateComputeUnits(event);

    const record: UsageRecord = {
      sessionId: event.sessionId,
      workspaceId: event.workspaceId,
      timestamp: event.timestamp,
      tokensIn: event.tokensIn,
      tokensOut: event.tokensOut,
      toolsExecuted: event.toolsExecuted,
      frontierCalls: event.frontierCalls,
      edgeCalls: event.edgeCalls,
      workflowSuccess: event.workflowSuccess,
      computeUnits,
    };

    if (!this.usageRecords.has(event.workspaceId)) {
      this.usageRecords.set(event.workspaceId, []);
    }
    this.usageRecords.get(event.workspaceId)!.push(record);

    logger.debug({ workspaceId: event.workspaceId, computeUnits }, 'Usage recorded');
    return ok(record);
  }

  public getUsageSummary(
    workspaceId: string,
    periodStart?: string,
    periodEnd?: string,
  ): Result<BillingPeriod, Error> {
    const records = this.usageRecords.get(workspaceId) ?? [];
    const license = this.licenses.get(workspaceId);

    if (!license) {
      return err(new Error(`License not found: ${workspaceId}`));
    }

    const start = periodStart ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = periodEnd ?? new Date().toISOString();

    const periodRecords = records.filter(
      (r) => r.timestamp >= start && r.timestamp <= end,
    );

    const totalComputeUnits = periodRecords.reduce((sum, r) => sum + r.computeUnits, 0);
    const totalSuccessfulWorkflows = periodRecords.filter((r) => r.workflowSuccess).length;

    const baseFee = license.monthlyFee;
    const variableFee = Math.round(totalComputeUnits * this.config.baseRate);
    const outcomeFee = Math.round(totalSuccessfulWorkflows * this.config.outcomeFee);
    const totalAmount = baseFee + variableFee + outcomeFee;

    const period: BillingPeriod = {
      workspaceId,
      periodStart: start,
      periodEnd: end,
      totalComputeUnits,
      totalSuccessfulWorkflows,
      baseFee,
      variableFee,
      outcomeFee,
      totalAmount,
    };

    return ok(period);
  }

  // ---- Invoicing ----

  public async generateInvoice(workspaceId: string): Promise<Result<InvoiceData, Error>> {
    const periodResult = this.getUsageSummary(workspaceId);
    if (periodResult.isErr()) return err(periodResult.error);

    const period = periodResult.value;
    const license = this.licenses.get(workspaceId);
    if (!license) {
      return err(new Error(`License not found: ${workspaceId}`));
    }

    try {
      // Create Stripe invoice
      const invoice = await this.stripe.invoices.create({
        customer: license.stripeCustomerId,
        auto_advance: true,
        collection_method: 'send_invoice',
        days_until_due: 30,
      });

      // Add line items
      await this.stripe.invoiceItems.create({
        customer: license.stripeCustomerId,
        invoice: invoice.id,
        amount: period.baseFee,
        currency: 'usd',
        description: `NEXUS ${license.tier} plan — base fee`,
      });

      if (period.variableFee > 0) {
        await this.stripe.invoiceItems.create({
          customer: license.stripeCustomerId,
          invoice: invoice.id,
          amount: period.variableFee,
          currency: 'usd',
          description: `Usage: ${period.totalComputeUnits} compute units`,
        });
      }

      if (period.outcomeFee > 0) {
        await this.stripe.invoiceItems.create({
          customer: license.stripeCustomerId,
          invoice: invoice.id,
          amount: period.outcomeFee,
          currency: 'usd',
          description: `Outcome: ${period.totalSuccessfulWorkflows} successful workflows`,
        });
      }

      // Finalize and send
      await this.stripe.invoices.finalizeInvoice(invoice.id);
      await this.stripe.invoices.sendInvoice(invoice.id);

      const invoiceData: InvoiceData = {
        invoiceId: uuid(),
        workspaceId,
        billingPeriod: period,
        stripeInvoiceId: invoice.id,
        status: 'open',
        createdAt: new Date().toISOString(),
      };

      logger.info(
        { workspaceId, invoiceId: invoiceData.invoiceId, amount: period.totalAmount },
        'Invoice generated and sent',
      );

      return ok(invoiceData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ workspaceId, error: message }, 'Invoice generation failed');
      return err(new Error(`Invoice generation failed: ${message}`));
    }
  }

  // ---- Compute Unit Calculation ----

  public calculateComputeUnits(event: UsageEvent): number {
    // Weighted formula for compute units
    const tokenUnits = (event.tokensIn + event.tokensOut) / 1000;
    const toolUnits = event.toolsExecuted * 0.5;
    const frontierUnits = event.frontierCalls * 10;  // Frontier calls are expensive
    const edgeUnits = event.edgeCalls * 0.1;          // Edge calls are cheap

    return Math.round((tokenUnits + toolUnits + frontierUnits + edgeUnits) * 100) / 100;
  }
}

export { BillingService as default };
