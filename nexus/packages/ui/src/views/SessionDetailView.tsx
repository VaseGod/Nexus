import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

interface AgentEvent {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export default function SessionDetailView(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    // Mock timeline data
    setEvents([
      { id: '1', type: 'session_start', timestamp: new Date(Date.now() - 5000).toISOString(), data: { nlahId: 'code-review-agent' } },
      { id: '2', type: 'plan_generated', timestamp: new Date(Date.now() - 4000).toISOString(), data: { steps: 5 } },
      { id: '3', type: 'fork_started', timestamp: new Date(Date.now() - 3500).toISOString(), data: { branchCount: 3 } },
      { id: '4', type: 'tool_executed', timestamp: new Date(Date.now() - 3000).toISOString(), data: { tool: 'read_file', duration: 120 } },
      { id: '5', type: 'memory_write', timestamp: new Date(Date.now() - 2000).toISOString(), data: { topic: 'auth-module' } },
      { id: '6', type: 'join_completed', timestamp: new Date(Date.now() - 1500).toISOString(), data: { winningBranch: 'branch-2' } },
      { id: '7', type: 'validation_complete', timestamp: new Date(Date.now() - 1000).toISOString(), data: { passed: true } },
      { id: '8', type: 'report_generated', timestamp: new Date().toISOString(), data: { issues: 2 } },
    ]);
  }, [id]);

  const eventIcon = (type: string): string => {
    const icons: Record<string, string> = {
      session_start: '🚀',
      plan_generated: '📋',
      task_delegated: '📤',
      fork_started: '🔀',
      tool_executed: '🔧',
      memory_read: '📖',
      memory_write: '✏️',
      join_completed: '🔗',
      validation_complete: '✅',
      report_generated: '📊',
      security_alert: '🚨',
      error: '❌',
      session_end: '🏁',
    };
    return icons[type] ?? '▸';
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Session {id}</h2>
        <p className="text-sm text-nexus-muted mt-1">AgentEvent Timeline</p>
      </div>

      {/* DAG Visualization placeholder */}
      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-nexus-accent-bright mb-3">
          Execution Flow
        </h3>
        <div className="flex items-center gap-2 text-xs overflow-x-auto pb-2">
          {events.map((event, i) => (
            <div key={event.id} className="flex items-center gap-2">
              <div className="flex flex-col items-center min-w-[80px]">
                <div className="text-lg">{eventIcon(event.type)}</div>
                <div className="text-nexus-muted text-center mt-1">
                  {event.type.replace(/_/g, ' ')}
                </div>
              </div>
              {i < events.length - 1 && (
                <div className="text-nexus-border">→</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-1">
        {events.map((event) => (
          <div key={event.id} className="terminal-line flex gap-3 py-1.5 px-3 hover:bg-nexus-border/30 rounded">
            <span className="timestamp whitespace-nowrap">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
            <span className="text-lg leading-5">{eventIcon(event.type)}</span>
            <span className="event-type">{event.type}</span>
            <span className="text-nexus-muted truncate">
              {JSON.stringify(event.data)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
