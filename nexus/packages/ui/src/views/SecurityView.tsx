import { useState } from 'react';

interface QuarantineItem {
  id: string;
  topicSlug: string;
  anomalyScore: number;
  submittedAt: string;
  decision?: string;
}

interface TrapDetection {
  id: string;
  patternName: string;
  severity: string;
  timestamp: string;
  source: string;
}

export default function SecurityView(): JSX.Element {
  const [quarantine] = useState<QuarantineItem[]>([
    { id: 'q-1', topicSlug: 'api-keys', anomalyScore: 0.89, submittedAt: new Date().toISOString() },
    { id: 'q-2', topicSlug: 'admin-creds', anomalyScore: 0.95, submittedAt: new Date(Date.now() - 3600000).toISOString() },
  ]);

  const [traps] = useState<TrapDetection[]>([
    { id: 't-1', patternName: 'Data Exfiltration via curl', severity: 'critical', timestamp: new Date().toISOString(), source: 'sandbox-001' },
    { id: 't-2', patternName: 'Path Traversal', severity: 'high', timestamp: new Date(Date.now() - 7200000).toISOString(), source: 'sandbox-003' },
  ]);

  const severityColor = (severity: string): string => {
    switch (severity) {
      case 'critical': return 'badge-danger';
      case 'high': return 'badge-warning';
      default: return 'badge-accent';
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Security Dashboard</h2>
        <p className="text-sm text-nexus-muted mt-1">Quarantine, sandbox violations, and trap detections</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <span className="stat-value text-nexus-warning">{quarantine.length}</span>
          <span className="stat-label">Quarantined</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-nexus-danger">{traps.length}</span>
          <span className="stat-label">Traps Detected</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-nexus-success">0</span>
          <span className="stat-label">Sandbox Violations</span>
        </div>
      </div>

      {/* Quarantine Queue */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3">🔒 Quarantine Queue</h3>
        <div className="space-y-2">
          {quarantine.map((item) => (
            <div key={item.id} className="card flex items-center justify-between">
              <div>
                <span className="font-mono text-sm text-nexus-accent-bright">{item.topicSlug}</span>
                <span className="text-xs text-nexus-muted ml-3">
                  Anomaly: {(item.anomalyScore * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1 text-xs bg-nexus-success/20 text-nexus-success rounded hover:bg-nexus-success/30 transition-colors">
                  Approve
                </button>
                <button className="px-3 py-1 text-xs bg-nexus-danger/20 text-nexus-danger rounded hover:bg-nexus-danger/30 transition-colors">
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trap Detections */}
      <div>
        <h3 className="text-lg font-semibold mb-3">🚨 Trap Detections</h3>
        <div className="space-y-2">
          {traps.map((trap) => (
            <div key={trap.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{trap.patternName}</span>
                  <span className="text-xs text-nexus-muted ml-3">from {trap.source}</span>
                </div>
                <span className={`badge ${severityColor(trap.severity)}`}>
                  {trap.severity}
                </span>
              </div>
              <div className="text-xs text-nexus-muted mt-1">
                {new Date(trap.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
