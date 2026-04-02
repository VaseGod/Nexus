// ============================================================================
// Trap Detector — regex + semantic pattern matching for security threats
// ============================================================================

import type { TrapPattern } from '@nexus/core';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'trap-detector' });

export const KNOWN_TRAP_PATTERNS: readonly TrapPattern[] = [
  // --- Exfiltration ---
  {
    id: 'exfil-curl',
    name: 'Data Exfiltration via curl/wget',
    category: 'exfiltration',
    regexPattern: '\\b(curl|wget)\\s+.*(-d|--data|--upload-file|--post-data)\\b',
    semanticDescription: 'Attempt to send data to external server via HTTP client',
    severity: 'critical',
  },
  {
    id: 'exfil-dns',
    name: 'DNS Exfiltration',
    category: 'exfiltration',
    regexPattern: '\\b(dig|nslookup|host)\\s+.*\\$',
    semanticDescription: 'Attempt to exfiltrate data via DNS queries',
    severity: 'high',
  },
  {
    id: 'exfil-base64-pipe',
    name: 'Base64 Encoded Exfiltration',
    category: 'exfiltration',
    regexPattern: 'base64\\s*\\|\\s*(curl|wget|nc|netcat)',
    semanticDescription: 'Base64 encode then pipe to network tool',
    severity: 'critical',
  },
  {
    id: 'exfil-env-leak',
    name: 'Environment Variable Leakage',
    category: 'exfiltration',
    regexPattern: '(\\$ENV|\\$\\{.*API_KEY|\\$\\{.*SECRET|\\$\\{.*PASSWORD|printenv|env\\s*\\|)',
    semanticDescription: 'Attempt to access or leak environment variables containing secrets',
    severity: 'critical',
  },

  // --- Privilege Escalation ---
  {
    id: 'privesc-sudo',
    name: 'Sudo Escalation',
    category: 'privilege_escalation',
    regexPattern: '\\bsudo\\b',
    semanticDescription: 'Attempt to escalate privileges via sudo',
    severity: 'critical',
  },
  {
    id: 'privesc-chmod',
    name: 'Permission Modification',
    category: 'privilege_escalation',
    regexPattern: '\\bchmod\\s+(\\+s|777|u\\+s|g\\+s|4[0-7]{3})',
    semanticDescription: 'Attempt to set setuid/setgid bits or open permissions',
    severity: 'high',
  },
  {
    id: 'privesc-chown',
    name: 'Ownership Change',
    category: 'privilege_escalation',
    regexPattern: '\\bchown\\s+root',
    semanticDescription: 'Attempt to change file ownership to root',
    severity: 'high',
  },

  // --- Injection ---
  {
    id: 'inject-shell',
    name: 'Shell Injection',
    category: 'injection',
    regexPattern: '[;|&`]\\s*(rm|dd|mkfs|shutdown|reboot|halt)',
    semanticDescription: 'Shell command injection with destructive commands',
    severity: 'critical',
  },
  {
    id: 'inject-sql',
    name: 'SQL Injection Pattern',
    category: 'injection',
    regexPattern: "('\\s*(OR|AND)\\s+['\"]?\\d+['\"]?\\s*=\\s*['\"]?\\d+|UNION\\s+SELECT|DROP\\s+TABLE|DELETE\\s+FROM\\s+\\w+\\s+WHERE\\s+1\\s*=\\s*1)",
    semanticDescription: 'SQL injection attempt patterns',
    severity: 'critical',
  },
  {
    id: 'inject-path-traversal',
    name: 'Path Traversal',
    category: 'injection',
    regexPattern: '(\\.\\./){2,}|(\\.\\.\\\\){2,}',
    semanticDescription: 'Directory traversal to access files outside sandbox',
    severity: 'high',
  },

  // --- Evasion ---
  {
    id: 'evasion-encode',
    name: 'Encoded Command Evasion',
    category: 'evasion',
    regexPattern: '(eval|exec)\\s*\\(\\s*(atob|Buffer\\.from|decodeURIComponent)',
    semanticDescription: 'Attempt to evade detection via encoded command execution',
    severity: 'high',
  },
  {
    id: 'evasion-reverse-shell',
    name: 'Reverse Shell',
    category: 'evasion',
    regexPattern: '\\b(nc|netcat|ncat)\\s+.*-e\\s+(/bin/sh|/bin/bash|cmd\\.exe)',
    semanticDescription: 'Attempt to open a reverse shell',
    severity: 'critical',
  },
  {
    id: 'evasion-rm-rf',
    name: 'Destructive File Operations',
    category: 'evasion',
    regexPattern: '\\brm\\s+(-rf|-fr|--recursive\\s+--force)\\s+(/|~|\\$HOME|\\$\\{HOME\\})',
    semanticDescription: 'Attempt to recursively delete critical directories',
    severity: 'critical',
  },
];

interface DetectionResult {
  readonly detected: boolean;
  readonly matchedPatterns: readonly TrapPattern[];
  readonly highestSeverity: TrapPattern['severity'] | null;
}

export class TrapDetector {
  private readonly patterns: readonly TrapPattern[];
  private readonly compiledPatterns: Map<string, RegExp>;

  constructor(customPatterns?: readonly TrapPattern[]) {
    this.patterns = customPatterns ?? KNOWN_TRAP_PATTERNS;
    this.compiledPatterns = new Map();

    for (const pattern of this.patterns) {
      try {
        this.compiledPatterns.set(pattern.id, new RegExp(pattern.regexPattern, 'gi'));
      } catch (error) {
        logger.warn({ patternId: pattern.id, error }, 'Failed to compile trap pattern regex');
      }
    }
  }

  public detect(input: string): DetectionResult {
    const matchedPatterns: TrapPattern[] = [];

    for (const pattern of this.patterns) {
      const regex = this.compiledPatterns.get(pattern.id);
      if (!regex) continue;

      // Reset regex state
      regex.lastIndex = 0;

      if (regex.test(input)) {
        matchedPatterns.push(pattern);
        logger.warn(
          { patternId: pattern.id, patternName: pattern.name, severity: pattern.severity },
          'Trap pattern detected',
        );
      }
    }

    const severityOrder: Record<TrapPattern['severity'], number> = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3,
    };

    const highestSeverity = matchedPatterns.reduce<TrapPattern['severity'] | null>(
      (highest, pattern) => {
        if (!highest) return pattern.severity;
        return severityOrder[pattern.severity] > severityOrder[highest]
          ? pattern.severity
          : highest;
      },
      null,
    );

    return {
      detected: matchedPatterns.length > 0,
      matchedPatterns,
      highestSeverity,
    };
  }

  public addPattern(pattern: TrapPattern): void {
    try {
      this.compiledPatterns.set(pattern.id, new RegExp(pattern.regexPattern, 'gi'));
      (this.patterns as TrapPattern[]).push(pattern);
    } catch (error) {
      logger.error({ patternId: pattern.id, error }, 'Failed to add trap pattern');
    }
  }
}
