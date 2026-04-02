// ============================================================================
// Layer 3 — TranscriptLog: append-only JSONL transcript logging
// ============================================================================

import { appendFile, readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { Result, ok, err } from 'neverthrow';
import type { TranscriptLogEntry } from '@nexus/core';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'transcript-log' });

export class TranscriptLog {
  private readonly transcriptsDir: string;

  constructor(basePath: string) {
    this.transcriptsDir = join(basePath, 'transcripts');
  }

  public async initialize(): Promise<Result<void, Error>> {
    try {
      await mkdir(this.transcriptsDir, { recursive: true });
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Failed to initialize transcript log: ${message}`));
    }
  }

  public async append(
    sessionId: string,
    entry: TranscriptLogEntry,
  ): Promise<Result<void, Error>> {
    try {
      const filePath = this.sessionFilePath(sessionId);
      const line = JSON.stringify(entry) + '\n';
      await appendFile(filePath, line, 'utf-8');
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ sessionId, error: message }, 'Failed to append transcript entry');
      return err(new Error(`Failed to append transcript: ${message}`));
    }
  }

  public async getSessionTranscript(
    sessionId: string,
  ): Promise<Result<TranscriptLogEntry[], Error>> {
    try {
      const filePath = this.sessionFilePath(sessionId);
      const entries: TranscriptLogEntry[] = [];

      const fileStream = createReadStream(filePath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (line.trim()) {
          try {
            entries.push(JSON.parse(line) as TranscriptLogEntry);
          } catch {
            logger.warn({ sessionId, line: line.slice(0, 100) }, 'Skipping malformed log entry');
          }
        }
      }

      return ok(entries);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return ok([]);
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Failed to read transcript: ${message}`));
    }
  }

  public async grepTranscripts(
    query: string,
    sessionId?: string,
  ): Promise<Result<TranscriptLogEntry[], Error>> {
    try {
      const queryLower = query.toLowerCase();
      const results: TranscriptLogEntry[] = [];

      if (sessionId) {
        // Search specific session
        const entries = await this.getSessionTranscript(sessionId);
        if (entries.isOk()) {
          for (const entry of entries.value) {
            if (this.entryMatchesQuery(entry, queryLower)) {
              results.push(entry);
            }
          }
        }
      } else {
        // Search all sessions
        const sessions = await this.listSessions();
        if (sessions.isOk()) {
          for (const sid of sessions.value) {
            const entries = await this.getSessionTranscript(sid);
            if (entries.isOk()) {
              for (const entry of entries.value) {
                if (this.entryMatchesQuery(entry, queryLower)) {
                  results.push(entry);
                }
              }
            }
          }
        }
      }

      logger.info({ query, resultCount: results.length, sessionId }, 'Transcript grep completed');
      return ok(results);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Grep failed: ${message}`));
    }
  }

  public async listSessions(): Promise<Result<string[], Error>> {
    try {
      const files = await readdir(this.transcriptsDir);
      return ok(
        files
          .filter((f) => f.endsWith('.jsonl'))
          .map((f) => f.replace('.jsonl', '')),
      );
    } catch {
      return ok([]);
    }
  }

  // ---- Internal helpers ----

  private sessionFilePath(sessionId: string): string {
    return join(this.transcriptsDir, `${sessionId}.jsonl`);
  }

  private entryMatchesQuery(entry: TranscriptLogEntry, queryLower: string): boolean {
    if (entry.content.toLowerCase().includes(queryLower)) return true;
    if (entry.toolCalls) {
      for (const call of entry.toolCalls) {
        if (call.name.toLowerCase().includes(queryLower)) return true;
        if (JSON.stringify(call.arguments).toLowerCase().includes(queryLower)) return true;
      }
    }
    return false;
  }
}
