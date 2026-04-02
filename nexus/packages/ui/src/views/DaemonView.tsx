import { useState } from 'react';

interface Subscription {
  id: string;
  type: string;
  nlahId: string;
  active: boolean;
  createdAt: string;
}

interface AuditEntry {
  entryId: string;
  trigger: string;
  action: string;
  outcome: string;
  humanApprovalRequired: boolean;
  timestamp: string;
}

export default function DaemonView(): JSX.Element {
  const [subscriptions] = useState<Subscription[]>([
    { id: 'sub-1', type: 'github', nlahId: 'code-review-agent', active: true, createdAt: '2024-03-10T00:00:00Z' },
    { id: 'sub-2', type: 'slack', nlahId: 'incident-response', active: true, createdAt: '2024-03-12T00:00:00Z' },
    { id: 'sub-3', type: 'webhook', nlahId: 'deploy-agent', active: false, createdAt: '2024-03-01T00:00:00Z' },
  ]);

  const [auditLog] = useState<AuditEntry[]>([
    { entryId: 'a-1', trigger: 'github', action: 'nlah:code-review-agent', outcome: 'success', humanApprovalRequired: false, timestamp: new Date().toISOString() },
    { entryId: 'a-2', trigger: 'slack', action: 'nlah:incident-response', outcome: 'blocked', humanApprovalRequired: true, timestamp: new Date(Date.now() - 1800000).toISOString() },
    { entryId: 'a-3', trigger: 'webhook', action: 'nlah:deploy-agent', outcome: 'failure', humanApprovalRequired: false, timestamp: new Date(Date.now() - 3600000).toISOString() },
  ]);

  const outcomeColor = (outcome: string): string => {
    switch (outcome) {
      case 'success': return 'badge-success';
      case 'blocked': return 'badge-warning';
      case 'failure': return 'badge-danger';
      default: return 'badge-accent';
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">KAIROS Daemon</h2>
        <p className="text-sm text-nexus-muted mt-1">Subscriptions, policies, and autonomous action log</p>
      </div>

      {/* Subscriptions */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Active Subscriptions</h3>
          <button className="px-3 py-1.5 bg-nexus-accent hover:bg-nexus-accent-bright text-white rounded-lg transition-colors text-xs">
            + Add Subscription
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {subscriptions.map((sub) => (
            <div key={sub.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="badge badge-accent">{sub.type}</span>
                <div className={`w-2 h-2 rounded-full ${sub.active ? 'bg-nexus-success' : 'bg-nexus-muted'}`} />
              </div>
              <div className="font-mono text-sm text-nexus-accent-bright">{sub.nlahId}</div>
              <div className="text-xs text-nexus-muted mt-1">
                Since {new Date(sub.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Log */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Autonomous Action Log</h3>
        <div className="space-y-2">
          {auditLog.map((entry) => (
            <div key={entry.entryId} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="badge badge-accent">{entry.trigger}</span>
                  <span className="text-sm font-mono">{entry.action}</span>
                  {entry.humanApprovalRequired && (
                    <span className="text-xs text-nexus-warning">⚠ Requires approval</span>
                  )}
                </div>
                <span className={`badge ${outcomeColor(entry.outcome)}`}>
                  {entry.outcome}
                </span>
              </div>
              <div className="text-xs text-nexus-muted mt-1">
                {new Date(entry.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
