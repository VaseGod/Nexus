# NEXUS Billing Model

## Pricing Structure

NEXUS uses a hybrid billing model combining **seat-based licensing** with
**usage-based metering** and **outcome-based fees**.

### Seat License Tiers

| Tier | Seats | Monthly Fee | Features |
|------|-------|-------------|----------|
| Starter | 5 | $49/mo | Core orchestration, basic memory |
| Professional | 25 | $199/mo | All features, edge intelligence, speculative decoding |
| Enterprise | 100 | $499/mo | Custom SLAs, dedicated support, priority compute |

### Usage Metering

Every IHR session emits a `UsageEvent`:

```json
{
  "sessionId": "ses-uuid",
  "workspaceId": "ws-uuid",
  "timestamp": "ISO8601",
  "tokensIn": 1500,
  "tokensOut": 800,
  "toolsExecuted": 4,
  "frontierCalls": 1,
  "edgeCalls": 10,
  "workflowSuccess": true
}
```

### Compute Unit Calculation

```
compute_units = (tokens_in + tokens_out) / 1000
             + tools_executed × 0.5
             + frontier_calls × 10    # expensive
             + edge_calls × 0.1       # cheap
```

### Invoice Formula

```
total = base_fee + (compute_units × base_rate) + (successful_workflows × outcome_fee)
```

Default rates:
- `base_rate`: $0.01 per compute unit
- `outcome_fee`: $0.50 per successful workflow

## Stripe Integration

### Invoice Generation Flow

1. Aggregation worker sums all `UsageEvent`s for the billing period
2. Computes `BillingPeriod` with base, variable, and outcome fees
3. Creates Stripe invoice via `stripe.invoices.create()`
4. Adds line items for each fee component
5. Finalizes and sends invoice automatically

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /billing/usage/:workspaceId` | Current period usage summary |
| `GET /billing/invoice/:invoiceId` | Invoice details |

### Required Environment Variables

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## DynamoDB Tables

- **WorkspaceLicense**: partition key = `workspaceId`
- **UsageEvents**: partition key = `workspaceId`, sort key = `timestamp`

Both tables use PAY_PER_REQUEST billing and have point-in-time recovery enabled.
