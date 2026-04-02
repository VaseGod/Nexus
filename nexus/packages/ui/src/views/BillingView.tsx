import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const usageData = [
  { day: 'Mon', computeUnits: 120, cost: 48 },
  { day: 'Tue', computeUnits: 180, cost: 72 },
  { day: 'Wed', computeUnits: 95, cost: 38 },
  { day: 'Thu', computeUnits: 240, cost: 96 },
  { day: 'Fri', computeUnits: 310, cost: 124 },
  { day: 'Sat', computeUnits: 45, cost: 18 },
  { day: 'Sun', computeUnits: 60, cost: 24 },
];

const invoices = [
  { id: 'inv-001', period: 'March 2024', amount: 549.00, status: 'paid' },
  { id: 'inv-002', period: 'February 2024', amount: 482.50, status: 'paid' },
  { id: 'inv-003', period: 'January 2024', amount: 315.00, status: 'paid' },
];

export default function BillingView(): JSX.Element {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Billing & Usage</h2>
        <p className="text-sm text-nexus-muted mt-1">Compute usage metrics and invoice history</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="stat-card">
          <span className="stat-value">1,050</span>
          <span className="stat-label">Compute Units (MTD)</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-nexus-success">$420</span>
          <span className="stat-label">Variable Cost (MTD)</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">$199</span>
          <span className="stat-label">Base Fee</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-nexus-accent-bright">87%</span>
          <span className="stat-label">Workflow Success Rate</span>
        </div>
      </div>

      {/* Usage Chart */}
      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-nexus-accent-bright mb-4">
          Weekly Compute Usage
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={usageData}>
              <defs>
                <linearGradient id="colorUnits" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
              <XAxis dataKey="day" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#12121a',
                  border: '1px solid #1e1e2e',
                  borderRadius: '8px',
                  color: '#e5e7eb',
                  fontSize: '12px',
                }}
              />
              <Area
                type="monotone"
                dataKey="computeUnits"
                stroke="#7c3aed"
                fillOpacity={1}
                fill="url(#colorUnits)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Invoice History */}
      <div className="card">
        <h3 className="text-sm font-semibold text-nexus-accent-bright mb-4">Invoice History</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-nexus-muted text-xs border-b border-nexus-border">
              <th className="text-left py-2">Invoice</th>
              <th className="text-left py-2">Period</th>
              <th className="text-right py-2">Amount</th>
              <th className="text-right py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-nexus-border/50 hover:bg-nexus-border/20">
                <td className="py-3 font-mono text-nexus-accent-bright">{inv.id}</td>
                <td className="py-3 text-nexus-muted">{inv.period}</td>
                <td className="py-3 text-right">${inv.amount.toFixed(2)}</td>
                <td className="py-3 text-right">
                  <span className="badge badge-success">{inv.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
