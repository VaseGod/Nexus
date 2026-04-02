import { useState, useEffect } from 'react';

interface Session {
  id: string;
  nlahId: string;
  status: string;
  startedAt: string;
  eventCount: number;
}

export default function SessionsView(): JSX.Element {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data for demo
    setSessions([
      { id: 'ses-001', nlahId: 'code-review-agent', status: 'running', startedAt: new Date().toISOString(), eventCount: 12 },
      { id: 'ses-002', nlahId: 'deploy-agent', status: 'completed', startedAt: new Date(Date.now() - 3600000).toISOString(), eventCount: 8 },
      { id: 'ses-003', nlahId: 'security-scan-agent', status: 'failed', startedAt: new Date(Date.now() - 7200000).toISOString(), eventCount: 5 },
    ]);
    setLoading(false);
  }, []);

  const statusBadge = (status: string): string => {
    switch (status) {
      case 'running': return 'badge badge-success';
      case 'completed': return 'badge badge-accent';
      case 'failed': return 'badge badge-danger';
      default: return 'badge badge-warning';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Active Sessions</h2>
          <p className="text-sm text-nexus-muted mt-1">Real-time IHR session monitoring</p>
        </div>
        <button className="px-4 py-2 bg-nexus-accent hover:bg-nexus-accent-bright text-white rounded-lg transition-colors text-sm">
          + New Session
        </button>
      </div>

      {loading ? (
        <div className="text-nexus-muted animate-pulse">Loading sessions...</div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <a
              key={session.id}
              href={`/sessions/${session.id}`}
              className="card hover:border-nexus-accent/50 transition-all cursor-pointer block"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="font-mono text-sm text-nexus-accent-bright">
                    {session.id}
                  </div>
                  <div className="text-sm text-nexus-muted">{session.nlahId}</div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-nexus-muted">
                    {session.eventCount} events
                  </span>
                  <span className={statusBadge(session.status)}>
                    {session.status === 'running' && '● '}
                    {session.status}
                  </span>
                </div>
              </div>
              <div className="text-xs text-nexus-muted mt-2">
                Started {new Date(session.startedAt).toLocaleString()}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
