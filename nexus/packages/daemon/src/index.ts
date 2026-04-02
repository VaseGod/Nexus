// ============================================================================
// KAIROS Daemon — background process with subscription management
// ============================================================================

import { readFile, readdir, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import { Result, ok, err } from 'neverthrow';
import type { AgentEvent, SessionId } from '@nexus/core';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'kairos-daemon' });

// ============================================================================
// Types
// ============================================================================

interface Subscription {
  readonly id: string;
  readonly type: 'webhook' | 'slack' | 'github' | 'sse';
  readonly config: Record<string, unknown>;
  readonly nlahId: string;
  readonly active: boolean;
  readonly createdAt: string;
}

interface ApprovedActionPolicy {
  readonly id: string;
  readonly name: string;
  readonly trigger: string;
  readonly allowedActions: readonly string[];
  readonly requiresHumanApproval: boolean;
  readonly maxAutoExecutions: number;
}

interface AuditLogEntry {
  readonly entryId: string;
  readonly trigger: string;
  readonly action: string;
  readonly outcome: 'success' | 'failure' | 'blocked';
  readonly humanApprovalRequired: boolean;
  readonly timestamp: string;
  readonly subscriptionId: string;
  readonly sessionId?: SessionId;
  readonly details?: Record<string, unknown>;
}

// ============================================================================
// KAIROS Daemon
// ============================================================================

export class KairosDaemon {
  private readonly subscriptions: Map<string, Subscription> = new Map();
  private readonly policies: Map<string, ApprovedActionPolicy> = new Map();
  private readonly auditLog: AuditLogEntry[] = [];
  private readonly policiesDir: string;
  private readonly auditLogPath: string;
  private isRunning = false;
  private shutdownHandlers: (() => Promise<void>)[] = [];

  constructor(basePath: string) {
    this.policiesDir = join(basePath, 'policies');
    this.auditLogPath = join(basePath, 'audit-log.jsonl');
  }

  // ---- Lifecycle ----

  public async start(): Promise<void> {
    if (this.isRunning) return;

    logger.info('KAIROS daemon starting');

    // Load policies
    await this.loadPolicies();

    // Setup graceful shutdown
    this.setupShutdownHandlers();

    this.isRunning = true;
    logger.info(
      { subscriptionCount: this.subscriptions.size, policyCount: this.policies.size },
      'KAIROS daemon started',
    );
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('KAIROS daemon shutting down gracefully');

    for (const handler of this.shutdownHandlers) {
      await handler();
    }

    this.isRunning = false;
    logger.info('KAIROS daemon stopped');
  }

  // ---- Subscription Management ----

  public addSubscription(
    type: Subscription['type'],
    nlahId: string,
    config: Record<string, unknown>,
  ): Result<Subscription, Error> {
    const subscription: Subscription = {
      id: uuid(),
      type,
      config,
      nlahId,
      active: true,
      createdAt: new Date().toISOString(),
    };

    this.subscriptions.set(subscription.id, subscription);
    logger.info({ subscriptionId: subscription.id, type }, 'Subscription added');

    return ok(subscription);
  }

  public removeSubscription(id: string): Result<void, Error> {
    if (!this.subscriptions.has(id)) {
      return err(new Error(`Subscription not found: ${id}`));
    }
    this.subscriptions.delete(id);
    return ok(undefined);
  }

  public getSubscriptions(): readonly Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  // ---- Event Processing ----

  public async processEvent(
    subscriptionId: string,
    eventData: Record<string, unknown>,
  ): Promise<Result<AuditLogEntry, Error>> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return err(new Error(`Subscription not found: ${subscriptionId}`));
    }

    // Find matching policy
    const matchingPolicy = this.findMatchingPolicy(subscription, eventData);

    const auditEntry: AuditLogEntry = {
      entryId: uuid(),
      trigger: subscription.type,
      action: `nlah:${subscription.nlahId}`,
      outcome: 'success',
      humanApprovalRequired: matchingPolicy?.requiresHumanApproval ?? true,
      timestamp: new Date().toISOString(),
      subscriptionId,
      details: eventData,
    };

    if (!matchingPolicy) {
      auditEntry = { ...auditEntry, outcome: 'blocked' } as AuditLogEntry;
      logger.warn({ subscriptionId }, 'No matching policy found, action blocked');
    } else if (matchingPolicy.requiresHumanApproval) {
      auditEntry = { ...auditEntry, outcome: 'blocked' } as AuditLogEntry;
      logger.info({ subscriptionId }, 'Action requires human approval');
    }

    // Log audit entry
    this.auditLog.push(auditEntry);
    await this.persistAuditEntry(auditEntry);

    return ok(auditEntry);
  }

  public getAuditLog(): readonly AuditLogEntry[] {
    return this.auditLog;
  }

  // ---- Webhook Handler ----

  public async handleWebhook(
    subscriptionId: string,
    payload: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<Result<void, Error>> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription || subscription.type !== 'webhook') {
      return err(new Error('Invalid webhook subscription'));
    }

    logger.info({ subscriptionId }, 'Processing webhook');
    const result = await this.processEvent(subscriptionId, payload);
    return result.map(() => undefined);
  }

  // ---- GitHub Webhook Handler ----

  public async handleGitHubWebhook(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<Result<void, Error>> {
    // Find GitHub subscriptions
    for (const [id, sub] of this.subscriptions) {
      if (sub.type === 'github' && sub.active) {
        const result = await this.processEvent(id, { event, ...payload });
        if (result.isErr()) {
          logger.error({ subscriptionId: id, error: result.error }, 'GitHub webhook processing failed');
        }
      }
    }
    return ok(undefined);
  }

  // ---- Internal ----

  private async loadPolicies(): Promise<void> {
    try {
      await mkdir(this.policiesDir, { recursive: true });
      const files = await readdir(this.policiesDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const raw = await readFile(join(this.policiesDir, file), 'utf-8');
        const policy = JSON.parse(raw) as ApprovedActionPolicy;
        this.policies.set(policy.id, policy);
      }

      logger.info({ policyCount: this.policies.size }, 'Policies loaded');
    } catch {
      logger.info('No policies directory found, starting with empty policy set');
    }
  }

  private findMatchingPolicy(
    subscription: Subscription,
    _eventData: Record<string, unknown>,
  ): ApprovedActionPolicy | undefined {
    for (const policy of this.policies.values()) {
      if (policy.trigger === subscription.type || policy.trigger === '*') {
        return policy;
      }
    }
    return undefined;
  }

  private async persistAuditEntry(entry: AuditLogEntry): Promise<void> {
    try {
      await mkdir(join(this.auditLogPath, '..'), { recursive: true });
      await appendFile(this.auditLogPath, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (error) {
      logger.error({ error }, 'Failed to persist audit entry');
    }
  }

  private setupShutdownHandlers(): void {
    const gracefulShutdown = async (): Promise<void> => {
      await this.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => void gracefulShutdown());
    process.on('SIGINT', () => void gracefulShutdown());
  }
}

export { KairosDaemon as default };
