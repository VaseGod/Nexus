// ============================================================================
// Structured Logger — pino wrapper with session/agent context
// ============================================================================

import pino from 'pino';

export type NexusLogger = pino.Logger;

export function createLogger(context: {
  service: string;
  sessionId?: string;
  agentId?: string;
}): NexusLogger {
  return pino({
    name: context.service,
    level: process.env['LOG_LEVEL'] ?? 'info',
    formatters: {
      level(label: string): { level: string } {
        return { level: label };
      },
    },
    base: {
      service: context.service,
      ...(context.sessionId ? { sessionId: context.sessionId } : {}),
      ...(context.agentId ? { agentId: context.agentId } : {}),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
