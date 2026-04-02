# NEXUS Security Model

## Threat Model

NEXUS agents execute arbitrary tool calls based on LLM outputs. The security layer
addresses threats from:

1. **Prompt injection**: Malicious user inputs that manipulate agent behavior
2. **Data exfiltration**: Attempts to send sensitive data to external services
3. **Privilege escalation**: Attempts to gain elevated filesystem/network access
4. **Memory poisoning**: Injecting false or contradictory information into agent memory
5. **Resource exhaustion**: Denial-of-service via unbounded computation

## Defense Layers

### 1. Sandbox Executor

All tool executions run inside isolated `child_process` with:

| Limit | Default |
|-------|---------|
| CPU | 1 core |
| Memory | 512 MB |
| Wall time | 30 seconds |
| Filesystem | Read-only (except `/tmp/sandbox/{session}/`) |
| Network | Blocked by default |

Network access can be whitelisted per-tool in the NLAH SOP definition.

### 2. Trap Detector

Regex + semantic pattern matching against known attack patterns:

| Category | Patterns | Severity |
|----------|----------|----------|
| Exfiltration | curl/wget data upload, DNS tunneling, base64 piping, env var leakage | Critical |
| Privilege Escalation | sudo, chmod setuid, chown root | Critical/High |
| Injection | Shell command injection, SQL injection, path traversal | Critical/High |
| Evasion | Encoded command execution, reverse shell, destructive rm | Critical/High |

When a trap is detected: execution is **immediately halted**, a `SecurityEvent` is
emitted on the event bus, and an alert webhook is fired.

### 3. Skeptical Memory Module

All memory writes pass through a 3-step verification pipeline:

1. **Cross-reference**: New facts checked against existing topic files for contradictions
2. **Anomaly detection**: Semantic distance from baseline embeddings (cosine similarity)
3. **Quarantine**: Inputs with `anomaly_score > 0.7` are quarantined for human review

Quarantined entries include:
- Full content
- Anomaly score
- Detected contradictions
- Audit trail (who submitted, when, review status)

### 4. Approved Action Policies

The KAIROS daemon only executes autonomous actions that match a policy in
`/daemon/policies/*.json`. Policies are human-editable JSON files:

```json
{
  "id": "policy-001",
  "name": "Auto Code Review",
  "trigger": "github",
  "allowedActions": ["nlah:code-review-agent"],
  "requiresHumanApproval": false,
  "maxAutoExecutions": 100
}
```

## Audit Log Schema

Every autonomous action is logged:

```json
{
  "entryId": "uuid",
  "trigger": "github | slack | webhook | scheduled",
  "action": "nlah:agent-id",
  "outcome": "success | failure | blocked",
  "humanApprovalRequired": true,
  "timestamp": "ISO8601",
  "subscriptionId": "sub-id",
  "sessionId": "ses-id",
  "details": {}
}
```

Logs are stored as append-only JSONL at `/daemon/audit-log.jsonl`.
In production: also written to DynamoDB `AuditLog` table with 30-day CloudWatch retention.
