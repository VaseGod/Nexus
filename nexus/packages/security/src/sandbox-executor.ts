// ============================================================================
// Sandbox Executor — isolated tool execution with resource limits
// ============================================================================

import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import { Result, ok, err } from 'neverthrow';
import type { SandboxConfig, SecurityEvent, AgentId, SessionId } from '@nexus/core';
import { createLogger, DEFAULT_SANDBOX_LIMITS } from '@nexus/core';
import { TrapDetector } from './trap-detector.js';

const logger = createLogger({ service: 'sandbox-executor' });

interface SandboxResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly killed: boolean;
  readonly killReason?: string;
}

export class SandboxExecutor {
  private readonly config: SandboxConfig;
  private readonly trapDetector: TrapDetector;
  private readonly baseTmpDir: string;

  constructor(config?: Partial<SandboxConfig>) {
    this.config = { ...DEFAULT_SANDBOX_LIMITS, ...config };
    this.trapDetector = new TrapDetector();
    this.baseTmpDir = '/tmp/sandbox';
  }

  public async execute(
    command: string,
    args: string[],
    input: string,
    sessionId: SessionId,
    agentId: AgentId,
    networkWhitelist: readonly string[] = [],
  ): Promise<Result<SandboxResult, Error>> {
    const sandboxId = uuid().slice(0, 8);
    const sandboxDir = join(this.baseTmpDir, sessionId, sandboxId);

    // Step 1: Check for traps in the command and input
    const fullCommand = `${command} ${args.join(' ')} ${input}`;
    const trapResult = this.trapDetector.detect(fullCommand);

    if (trapResult.detected) {
      logger.error(
        { sessionId, agentId, trapPatterns: trapResult.matchedPatterns },
        'Trap detected in sandbox execution — HALTED',
      );

      return err(
        new Error(
          `Security trap detected: ${trapResult.matchedPatterns.map((p) => p.name).join(', ')}`,
        ),
      );
    }

    try {
      // Step 2: Create isolated sandbox directory
      await mkdir(sandboxDir, { recursive: true });

      // Step 3: Execute with resource limits
      const result = await this.runInSandbox(command, args, input, sandboxDir);

      // Step 4: Cleanup
      await rm(sandboxDir, { recursive: true, force: true });

      logger.info(
        { sessionId, agentId, sandboxId, exitCode: result.exitCode, durationMs: result.durationMs },
        'Sandbox execution completed',
      );

      return ok(result);
    } catch (error) {
      // Cleanup on error
      await rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Sandbox execution failed: ${message}`));
    }
  }

  private runInSandbox(
    command: string,
    args: string[],
    input: string,
    sandboxDir: string,
  ): Promise<SandboxResult> {
    return new Promise((resolve) => {
      const startTime = performance.now();
      let stdout = '';
      let stderr = '';
      let killed = false;
      let killReason: string | undefined;

      const child = spawn(command, args, {
        cwd: sandboxDir,
        env: {
          ...process.env,
          TMPDIR: sandboxDir,
          HOME: sandboxDir,
          NODE_OPTIONS: `--max-old-space-size=${this.config.memoryMb}`,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.config.wallTimeMs,
      });

      // Track output size to prevent memory exhaustion
      let outputSize = 0;
      const maxOutputSize = 10 * 1024 * 1024; // 10MB

      child.stdout?.on('data', (data: Buffer) => {
        outputSize += data.length;
        if (outputSize > maxOutputSize) {
          child.kill('SIGKILL');
          killed = true;
          killReason = 'Output size limit exceeded';
          return;
        }
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        outputSize += data.length;
        if (outputSize > maxOutputSize) {
          child.kill('SIGKILL');
          killed = true;
          killReason = 'Output size limit exceeded';
          return;
        }
        stderr += data.toString();
      });

      if (input && child.stdin) {
        child.stdin.write(input);
        child.stdin.end();
      }

      // Wall time enforcer
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        killed = true;
        killReason = `Wall time exceeded (${this.config.wallTimeMs}ms)`;
      }, this.config.wallTimeMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Math.round(performance.now() - startTime);

        resolve({
          exitCode: code ?? 1,
          stdout: stdout.slice(0, maxOutputSize),
          stderr: stderr.slice(0, maxOutputSize),
          durationMs,
          killed,
          killReason,
        });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        const durationMs = Math.round(performance.now() - startTime);

        resolve({
          exitCode: 1,
          stdout,
          stderr: error.message,
          durationMs,
          killed: false,
        });
      });
    });
  }
}
