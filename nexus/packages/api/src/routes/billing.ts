// ============================================================================
// Billing Router — usage & invoices
// ============================================================================

import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { BillingService } from '@nexus/billing';

export const billingRouter = Router();

const billingService = new BillingService({
  stripeSecretKey: process.env['STRIPE_SECRET_KEY'] ?? '',
  baseRate: 0.01,
  outcomeFee: 0.50,
});

// ---- GET /billing/usage/:workspaceId ----
billingRouter.get('/usage/:workspaceId', (req: AuthenticatedRequest, res) => {
  const workspaceId = req.params['workspaceId'] ?? '';
  const result = billingService.getUsageSummary(workspaceId);

  if (result.isErr()) {
    res.status(404).json({ error: result.error.message });
    return;
  }

  res.json({ usage: result.value });
});

// ---- GET /billing/invoice/:invoiceId ----
billingRouter.get('/invoice/:invoiceId', (req: AuthenticatedRequest, res) => {
  // In production: look up Stripe invoice by ID
  res.json({
    invoiceId: req.params['invoiceId'],
    status: 'pending',
    message: 'Invoice retrieval would fetch from Stripe API',
  });
});
