import { Routes, Route, NavLink } from 'react-router-dom';
import SessionsView from './views/SessionsView';
import SessionDetailView from './views/SessionDetailView';
import MemoryView from './views/MemoryView';
import SecurityView from './views/SecurityView';
import BillingView from './views/BillingView';
import DaemonView from './views/DaemonView';

const NAV_ITEMS = [
  { path: '/sessions', label: '▸ Sessions', icon: '⚡' },
  { path: '/memory', label: '▸ Memory', icon: '🧠' },
  { path: '/security', label: '▸ Security', icon: '🛡️' },
  { path: '/billing', label: '▸ Billing', icon: '💳' },
  { path: '/daemon', label: '▸ Daemon', icon: '👁️' },
];

export default function App(): JSX.Element {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-nexus-surface border-r border-nexus-border flex flex-col">
        <div className="p-6 border-b border-nexus-border">
          <h1 className="text-xl font-bold text-nexus-accent-bright tracking-wider">
            ◆ NEXUS
          </h1>
          <p className="text-xs text-nexus-muted mt-1">Command Center v0.1.0</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-nexus-border">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-nexus-success animate-pulse"></div>
            <span className="text-xs text-nexus-muted">All systems nominal</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-6">
        <Routes>
          <Route path="/" element={<SessionsView />} />
          <Route path="/sessions" element={<SessionsView />} />
          <Route path="/sessions/:id" element={<SessionDetailView />} />
          <Route path="/memory" element={<MemoryView />} />
          <Route path="/security" element={<SecurityView />} />
          <Route path="/billing" element={<BillingView />} />
          <Route path="/daemon" element={<DaemonView />} />
        </Routes>
      </main>
    </div>
  );
}
