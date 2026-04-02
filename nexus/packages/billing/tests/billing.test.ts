// ============================================================================
// Billing Tests — usage aggregation, compute unit calculation
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { BillingService } from '../src/index.js';
import type { UsageEvent } from '@nexus/core';

describe('BillingService', () => {
  let billing: BillingService;

  beforeEach(() => {
    billing = new BillingService({
      stripeSecretKey: 'sk_test_fake',
      baseRate: 0.01,
      outcomeFee: 0.50,
    });
  });

  // ---- Compute Unit Calculation ----

  describe('calculateComputeUnits', () => {
    it('should calculate compute units correctly', () => {
      const event: UsageEvent = {
        sessionId: 'ses-1',
        workspaceId: 'ws-1',
        timestamp: new Date().toISOString(),
        tokensIn: 1000,
        tokensOut: 500,
        toolsExecuted: 4,
        frontierCalls: 1,
        edgeCalls: 10,
        workflowSuccess: true,
      };

      const units = billing.calculateComputeUnits(event);

      // Expected: (1000+500)/1000 + 4*0.5 + 1*10 + 10*0.1 = 1.5 + 2 + 10 + 1 = 14.5
      expect(units).toBe(14.5);
    });

    it('should handle zero usage', () => {
      const event: UsageEvent = {
        sessionId: 'ses-1',
        workspaceId: 'ws-1',
        timestamp: new Date().toISOString(),
        tokensIn: 0,
        tokensOut: 0,
        toolsExecuted: 0,
        frontierCalls: 0,
        edgeCalls: 0,
        workflowSuccess: false,
      };

      const units = billing.calculateComputeUnits(event);
      expect(units).toBe(0);
    });

    it('should weight frontier calls much higher than edge calls', () => {
      const frontierEvent: UsageEvent = {
        sessionId: 'ses-1',
        workspaceId: 'ws-1',
        timestamp: new Date().toISOString(),
        tokensIn: 0,
        tokensOut: 0,
        toolsExecuted: 0,
        frontierCalls: 1,
        edgeCalls: 0,
        workflowSuccess: false,
      };

      const edgeEvent: UsageEvent = {
        ...frontierEvent,
        frontierCalls: 0,
        edgeCalls: 1,
      };

      const frontierUnits = billing.calculateComputeUnits(frontierEvent);
      const edgeUnits = billing.calculateComputeUnits(edgeEvent);

      expect(frontierUnits).toBeGreaterThan(edgeUnits * 10);
    });
  });

  // ---- License Management ----

  describe('License Management', () => {
    it('should create a workspace license', async () => {
      const result = await billing.createLicense('ws-1', 'professional', 'cus_test');
      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        expect(result.value.workspaceId).toBe('ws-1');
        expect(result.value.tier).toBe('professional');
        expect(result.value.seatsIncluded).toBe(25);
        expect(result.value.monthlyFee).toBe(19900); // $199 in cents
      }
    });

    it('should retrieve an existing license', async () => {
      await billing.createLicense('ws-1', 'starter', 'cus_test');
      const result = billing.getLicense('ws-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.tier).toBe('starter');
      }
    });

    it('should return error for non-existent license', () => {
      const result = billing.getLicense('ws-nonexistent');
      expect(result.isErr()).toBe(true);
    });
  });

  // ---- Usage Metering ----

  describe('Usage Metering', () => {
    it('should record usage and compute summary', async () => {
      await billing.createLicense('ws-1', 'professional', 'cus_test');

      const event: UsageEvent = {
        sessionId: 'ses-1',
        workspaceId: 'ws-1',
        timestamp: new Date().toISOString(),
        tokensIn: 2000,
        tokensOut: 1000,
        toolsExecuted: 5,
        frontierCalls: 2,
        edgeCalls: 20,
        workflowSuccess: true,
      };

      billing.recordUsage(event);

      const summary = billing.getUsageSummary('ws-1');
      expect(summary.isOk()).toBe(true);

      if (summary.isOk()) {
        expect(summary.value.totalComputeUnits).toBeGreaterThan(0);
        expect(summary.value.totalSuccessfulWorkflows).toBe(1);
        expect(summary.value.baseFee).toBe(19900);
        expect(summary.value.totalAmount).toBeGreaterThan(summary.value.baseFee);
      }
    });

    it('should aggregate multiple usage events', async () => {
      await billing.createLicense('ws-1', 'starter', 'cus_test');

      for (let i = 0; i < 5; i++) {
        billing.recordUsage({
          sessionId: `ses-${i}`,
          workspaceId: 'ws-1',
          timestamp: new Date().toISOString(),
          tokensIn: 500,
          tokensOut: 200,
          toolsExecuted: 2,
          frontierCalls: 1,
          edgeCalls: 5,
          workflowSuccess: i % 2 === 0,
        });
      }

      const summary = billing.getUsageSummary('ws-1');
      expect(summary.isOk()).toBe(true);

      if (summary.isOk()) {
        expect(summary.value.totalSuccessfulWorkflows).toBe(3); // 0, 2, 4
      }
    });
  });
});
