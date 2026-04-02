// ============================================================================
// Agent Event Bus — typed publish/subscribe for agent events
// ============================================================================

import { EventEmitter } from 'node:events';
import type { AgentEvent, AgentEventType } from '@nexus/core';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'event-bus' });

type EventHandler = (event: AgentEvent) => void | Promise<void>;

export class AgentEventBus {
  private readonly emitter: EventEmitter;
  private readonly history: AgentEvent[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory: number = 10_000) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
    this.maxHistory = maxHistory;
  }

  public emit(event: AgentEvent): void {
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    logger.debug({ eventType: event.type, sessionId: event.sessionId }, 'Event emitted');
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event);
  }

  public on(type: AgentEventType | '*', handler: EventHandler): void {
    this.emitter.on(type, handler);
  }

  public off(type: AgentEventType | '*', handler: EventHandler): void {
    this.emitter.off(type, handler);
  }

  public once(type: AgentEventType | '*', handler: EventHandler): void {
    this.emitter.once(type, handler);
  }

  public getHistory(sessionId?: string): readonly AgentEvent[] {
    if (!sessionId) return this.history;
    return this.history.filter((e) => e.sessionId === sessionId);
  }

  public getHistoryByType(type: AgentEventType, sessionId?: string): readonly AgentEvent[] {
    return this.getHistory(sessionId).filter((e) => e.type === type);
  }

  public clear(): void {
    this.history.length = 0;
  }
}
