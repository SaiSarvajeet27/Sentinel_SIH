import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Calendar,
  ChevronDown,
  Sparkles,
  MoreHorizontal,
  Laptop,
  Mail,
  KeyRound,
  Search,
  PlusCircle,
  Activity,
} from 'lucide-react';
import { useSOC } from '../components/common/SOCContext';
import { useTheme } from '../components/common/ThemeContext';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30',
  HIGH: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30',
  LOW: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30',
  INFO: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/30',
};

const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30',
  INVESTIGATING: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30',
  CONTAINED: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
  RESOLVED: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
  CLOSED: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border border-slate-500/30',
};

const PLAYBOOK_ICONS = [Laptop, Mail, KeyRound];
// Written out in full (not built from a template string) so Tailwind's
// class scanner — which only sees literal class names in source — keeps
// these in the production build.
const PLAYBOOK_STYLES = [
  { border: 'hover:border-blue-500/40', chip: 'bg-blue-500/15 text-blue-500' },
  { border: 'hover:border-purple-500/40', chip: 'bg-purple-500/15 text-purple-500' },
  { border: 'hover:border-emerald-500/40', chip: 'bg-emerald-500/15 text-emerald-500' },
];

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { authUser, setActiveIncidentId, incidents, metrics, dashboardExtras, aiEnabled } = useSOC();
  const { theme } = useTheme();
  const [threatFilter, setThreatFilter] = useState('All Threats');
  const [timeRange, setTimeRange] = useState('Last 24 Hours');

  const threatActivityData = dashboardExtras.threatActivity.length
    ? dashboardExtras.threatActivity
    : [{ time: 'now', events: 0 }];

  const threatTypesData = dashboardExtras.threatTypes.length
    ? dashboardExtras.threatTypes
    : [{ name: 'No alerts yet', value: 100, color: '#64748B' }];

  const recentAlerts = [...incidents]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 6)
    .map((inc) => ({
      id: inc.id,
      severity: inc.severity,
      threat: inc.title,
      source: inc.attackVector,
      status: inc.status,
      time: inc.updatedAt ? new Date(inc.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
    }));

  const openIncidents = incidents.filter((i) => i.status === 'OPEN' || i.status === 'INVESTIGATING');
  const worstRisk = openIncidents.length ? Math.max(...openIncidents.map((i) => i.riskScore)) : 0;
  const riskLabel = worstRisk >= 80 ? 'High Risk' : worstRisk >= 45 ? 'Elevated Risk' : worstRisk > 0 ? 'Low Risk' : 'Nominal';
  const topIncidentId = [...openIncidents].sort((a, b) => b.riskScore - a.riskScore)[0]?.id;

  const ops = dashboardExtras.opsSummary;
  const fmtDuration = (secs?: number) => {
    if (!secs) return '0s';
    // Seeded historical incidents can carry a first_seen far in the past,
    // which is honest data but reads as nonsense ("140879m 59s") in a
    // minutes-and-seconds format — scale the unit to the size of the number.
    const days = Math.floor(secs / 86400);
    if (days > 0) return `${days}d ${Math.floor((secs % 86400) / 3600)}h`;
    const hours = Math.floor(secs / 3600);
    if (hours > 0) return `${hours}h ${Math.floor((secs % 3600) / 60)}m`;
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const handleOpenAlert = (id: string) => {
    setActiveIncidentId(id);
    navigate(`/incident/${id}`);
  };

  return (
    <div className="space-y-5 font-sans transition-colors">
      {/* 1. COMMAND HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-soc-textPrimary tracking-tight flex items-center gap-2">
            Welcome back, {authUser?.name ? authUser.name.split(' ')[0] : 'Analyst'}! 👋
          </h1>
          <p className="text-xs text-soc-textSecondary mt-0.5">
            Security Operations Center Overview
          </p>
        </div>

        {/* Right Date & Range Selectors */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-soc-card border border-soc-border text-xs text-soc-textPrimary hover:border-soc-borderLight transition-colors cursor-pointer select-none shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-soc-textSecondary" />
            <span>15 May 2026, 1:28 PM</span>
            <ChevronDown className="w-3 h-3 text-soc-textSecondary" />
          </div>

          <div
            onClick={() => setTimeRange(timeRange === 'Last 24 Hours' ? 'Last 7 Days' : 'Last 24 Hours')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-soc-card border border-soc-border text-xs text-soc-textPrimary hover:border-soc-borderLight transition-colors cursor-pointer select-none shadow-sm"
          >
            <span>{timeRange}</span>
            <ChevronDown className="w-3 h-3 text-soc-textSecondary" />
          </div>
        </div>
      </div>

      {/* 2. FOUR COMPACT KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TOTAL EVENTS */}
        <div className="p-4 rounded-xl bg-soc-card border border-soc-border flex flex-col justify-between space-y-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-red-500/15 text-red-500">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-red-500">Events Processed</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-2xl font-extrabold text-soc-textPrimary tracking-tight">{metrics.totalEvents.toLocaleString()}</div>
              <div className="text-[11px] text-soc-textMuted mt-0.5 font-medium">across all sources</div>
            </div>
          </div>
        </div>

        {/* CRITICAL ALERTS */}
        <div className="p-4 rounded-xl bg-soc-card border border-soc-border flex flex-col justify-between space-y-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-red-500/15 text-red-500">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-red-500">Critical Threats</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-2xl font-extrabold text-soc-textPrimary tracking-tight">{metrics.criticalThreats}</div>
              <div className="text-[11px] text-soc-textMuted mt-0.5 font-medium">open, unresolved</div>
            </div>
          </div>
        </div>

        {/* PENDING APPROVALS */}
        <div className="p-4 rounded-xl bg-soc-card border border-soc-border flex flex-col justify-between space-y-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-500">
              <Clock className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-amber-500">Pending Approvals</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-2xl font-extrabold text-soc-textPrimary tracking-tight">{metrics.pendingApprovals}</div>
              <div className="text-[11px] text-soc-textMuted mt-0.5 font-medium">awaiting authorization</div>
            </div>
          </div>
        </div>

        {/* SYSTEM HEALTH */}
        <div className="p-4 rounded-xl bg-soc-card border border-soc-border flex flex-col justify-between space-y-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-500">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold text-emerald-500">System Health</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-2xl font-extrabold text-soc-textPrimary tracking-tight">{dashboardExtras.systemHealthScore}%</div>
              <div className="text-[11px] text-soc-textMuted mt-0.5 font-medium">
                {dashboardExtras.systemHealthScore >= 100 ? 'all systems operational' : 'degraded — see Settings'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. ANALYTICS GRID (Threat Activity, AI Risk Score, Top Threat Types) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Threat Activity AreaChart (6 cols) */}
        <div className="lg:col-span-6 p-4 rounded-xl bg-soc-card border border-soc-border flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xs font-bold text-soc-textPrimary flex items-center gap-1.5">
                <span>Threat Activity</span>
                <span className="text-[11px] font-normal text-soc-textSecondary">(Last 24 Hours)</span>
              </h2>
            </div>
            <div
              onClick={() => setThreatFilter(threatFilter === 'All Threats' ? 'Critical Only' : 'All Threats')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-soc-secondaryCard border border-soc-border text-[11px] text-soc-textPrimary hover:border-soc-borderLight cursor-pointer"
            >
              <span>{threatFilter}</span>
              <ChevronDown className="w-3 h-3 text-soc-textSecondary" />
            </div>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={threatActivityData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={theme === 'dark' ? '#1683FF' : '#1677FF'} stopOpacity={theme === 'dark' ? 0.35 : 0.2} />
                    <stop offset="95%" stopColor={theme === 'dark' ? '#1683FF' : '#1677FF'} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  stroke="#64748B"
                  fontSize={10}
                  tickLine={false}
                  axisLine={{ stroke: theme === 'dark' ? '#17304A' : '#E2E8F0' }}
                />
                <YAxis
                  stroke="#64748B"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: theme === 'dark' ? '#050B16' : '#FFFFFF',
                    borderColor: theme === 'dark' ? '#17304A' : '#DCE5EF',
                    color: theme === 'dark' ? '#F8FAFC' : '#0F172A',
                    borderRadius: '8px',
                    fontSize: '11px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="events"
                  stroke={theme === 'dark' ? '#1683FF' : '#1677FF'}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#blueGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Risk Score (3 cols) */}
        <div className="lg:col-span-3 p-4 rounded-xl bg-soc-card border border-soc-border flex flex-col items-center justify-between text-center shadow-sm">
          <div className="w-full flex items-center justify-between">
            <h2 className="text-xs font-bold text-soc-textPrimary">AI Risk Score</h2>
            <Sparkles className="w-3.5 h-3.5 text-soc-ai" />
          </div>

          {/* Donut Gauge */}
          <div className="relative my-2 flex items-center justify-center">
            <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r="46"
                stroke={theme === 'dark' ? '#17304A' : '#E2E8F0'}
                strokeWidth="9"
                fill="transparent"
              />
              <circle
                cx="60"
                cy="60"
                r="46"
                stroke="url(#riskGradient)"
                strokeWidth="9"
                fill="transparent"
                strokeDasharray="289.02"
                strokeDashoffset={289.02 * (1 - worstRisk / 100)}
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="riskGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={theme === 'dark' ? '#1683FF' : '#1677FF'} />
                  <stop offset="100%" stopColor={theme === 'dark' ? '#8B5CF6' : '#7C3AED'} />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold text-soc-textPrimary tracking-tight">{Math.round(worstRisk)}</span>
              <span className="text-[10px] text-soc-textSecondary">/100</span>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-soc-ai">{riskLabel}</div>
            <p className="text-[11px] text-soc-textSecondary mt-0.5 max-w-[170px]">
              {worstRisk > 0 ? 'Highest-risk incident currently open.' : 'No open incidents right now.'}
            </p>
          </div>
        </div>

        {/* Top Threat Types (3 cols) */}
        <div className="lg:col-span-3 p-4 rounded-xl bg-soc-card border border-soc-border flex flex-col justify-between shadow-sm">
          <h2 className="text-xs font-bold text-soc-textPrimary mb-1.5">Top Threat Types</h2>

          <div className="flex items-center justify-between gap-2 my-auto">
            {/* Pie Chart */}
            <div className="w-24 h-24 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={threatTypesData}
                    cx="50%"
                    cy="50%"
                    innerRadius={26}
                    outerRadius={42}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {threatTypesData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke={theme === 'dark' ? '#071426' : '#FFFFFF'} strokeWidth={2} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend with percentages */}
            <div className="space-y-1.5 text-xs flex-1">
              {threatTypesData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-soc-textSecondary text-[11px] truncate">{item.name}</span>
                  </div>
                  <span className="text-soc-textPrimary font-semibold text-[11px] ml-1">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. LOWER CONTENT ROW (Recent Alerts 2/3, Playbooks & Quick Actions 1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Recent Alerts (8 cols) */}
        <div className="lg:col-span-8 p-4 rounded-xl bg-soc-card border border-soc-border flex flex-col justify-between shadow-sm">
          <div>
            <h2 className="text-xs font-bold text-soc-textPrimary mb-2.5">Recent Alerts</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-soc-border text-soc-textMuted text-[10px] uppercase">
                    <th className="pb-2 font-medium">Severity</th>
                    <th className="pb-2 font-medium">Threat</th>
                    <th className="pb-2 font-medium">Source</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Time</th>
                    <th className="pb-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-soc-border/60">
                  {recentAlerts.length === 0 && (
                    <tr><td colSpan={6} className="py-4 text-center text-soc-textMuted text-xs">No incidents yet — run the demo or generate a scenario.</td></tr>
                  )}
                  {recentAlerts.map((alert) => (
                    <tr
                      key={alert.id}
                      onClick={() => handleOpenAlert(alert.id)}
                      className="hover:bg-soc-cardHover cursor-pointer transition-colors"
                    >
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${SEVERITY_STYLE[alert.severity]}`}>
                          {alert.severity}
                        </span>
                      </td>
                      <td className="py-2.5 font-medium text-soc-textPrimary text-xs">{alert.threat}</td>
                      <td className="py-2.5 text-soc-textSecondary text-[11px]">{alert.source}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_STYLE[alert.status]}`}>
                          {alert.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-soc-textSecondary text-[11px]">{alert.time}</td>
                      <td className="py-2.5 text-right text-soc-textSecondary hover:text-soc-textPrimary">
                        <MoreHorizontal className="w-4 h-4 ml-auto" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-2.5 border-t border-soc-border text-center mt-2">
            <button
              onClick={() => navigate('/incidents')}
              className="text-xs font-semibold text-soc-accent hover:underline"
            >
              View All Alerts →
            </button>
          </div>
        </div>

        {/* Right Stack: Recent Playbooks & Quick Actions (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Recent Playbooks */}
          <div className="p-4 rounded-xl bg-soc-card border border-soc-border space-y-2.5 shadow-sm">
            <h2 className="text-xs font-bold text-soc-textPrimary">Recent Playbooks</h2>

            <div className="space-y-2">
              {dashboardExtras.playbooks.length === 0 && (
                <div className="text-[11px] text-soc-textMuted p-2">No playbooks matched yet.</div>
              )}
              {dashboardExtras.playbooks.slice(0, 3).map((pb, i) => {
                const Icon = PLAYBOOK_ICONS[i % PLAYBOOK_ICONS.length];
                const style = PLAYBOOK_STYLES[i % PLAYBOOK_STYLES.length];
                return (
                  <div
                    key={pb.id}
                    onClick={() => navigate('/incidents')}
                    className={`flex items-center justify-between p-2 rounded-lg bg-soc-secondaryCard border border-soc-border cursor-pointer transition-colors ${style.border}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded ${style.chip}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-soc-textPrimary">{pb.name}</div>
                        <div className="text-[10px] text-soc-textSecondary">Matched {pb.used} times · executed {pb.executed}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => navigate('/incidents')}
              className="w-full py-1.5 rounded-lg bg-transparent border border-soc-border hover:bg-soc-cardHover text-xs font-medium text-soc-textPrimary transition-colors"
            >
              View All Incidents
            </button>
          </div>

          {/* Quick Actions */}
          <div className="p-4 rounded-xl bg-soc-card border border-soc-border space-y-2.5 shadow-sm">
            <h2 className="text-xs font-bold text-soc-textPrimary">Quick Actions</h2>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate(topIncidentId ? `/incident/${topIncidentId}` : '/incidents')}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-soc-secondaryCard border border-soc-border hover:border-soc-accent/60 transition-colors group"
                title="Investigate the highest-risk open incident"
              >
                <div className="p-1 text-soc-accent group-hover:scale-110 transition-transform">
                  <Search className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] text-soc-textSecondary group-hover:text-soc-textPrimary truncate w-full text-center mt-0.5">Investigate</span>
              </button>

              <button
                onClick={() => navigate('/rules')}
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-soc-secondaryCard border border-soc-border hover:border-emerald-500/60 transition-colors group"
                title="Detection rules & trust"
              >
                <div className="p-1 text-emerald-500 group-hover:scale-110 transition-transform">
                  <PlusCircle className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] text-soc-textSecondary group-hover:text-soc-textPrimary truncate w-full text-center mt-0.5">Rules</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Security Operations Summary */}
      <div>
        <div className="p-4 rounded-xl bg-soc-card border border-soc-border flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-soc-textPrimary flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-soc-accent" />
              <span>Security Operations Summary</span>
            </h2>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
              Live Ingestion Active
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border flex flex-col justify-between space-y-1">
              <span className="text-[10px] text-soc-textSecondary truncate">Events Processed</span>
              <div className="text-lg font-extrabold text-soc-textPrimary">{(ops.events_processed ?? 0).toLocaleString()}</div>
            </div>

            <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border flex flex-col justify-between space-y-1">
              <span className="text-[10px] text-soc-textSecondary truncate">Incidents Open</span>
              <div className="text-lg font-extrabold text-soc-textPrimary">{ops.incidents_open ?? 0}</div>
            </div>

            <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border flex flex-col justify-between space-y-1">
              <span className="text-[10px] text-soc-textSecondary truncate">MTTD</span>
              <div className="text-lg font-extrabold text-soc-textPrimary">{fmtDuration(ops.mttd_seconds)}</div>
            </div>

            <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border flex flex-col justify-between space-y-1">
              <span className="text-[10px] text-soc-textSecondary truncate">MTTR</span>
              <div className="text-lg font-extrabold text-soc-textPrimary">{fmtDuration(ops.mttr_seconds)}</div>
            </div>

            <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border flex flex-col justify-between space-y-1">
              <span className="text-[10px] text-soc-textSecondary truncate">Containment Rate</span>
              <div className="text-lg font-extrabold text-soc-textPrimary">{ops.containment_rate ?? 0}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* 6. BOTTOM SYSTEM STATUS STRIP */}
      <div className="p-3.5 rounded-xl bg-soc-card border border-soc-border flex flex-wrap items-center justify-between gap-3 text-xs text-soc-textSecondary shadow-sm">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-soc-textSecondary">Platform Status:</span>
            <span className="text-soc-textPrimary font-semibold">Operational</span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-soc-textSecondary">Events this run:</span>
            <span className="text-soc-textPrimary font-semibold">{(ops.ingestion_rate ?? 0).toLocaleString()}</span>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <span className="text-soc-textSecondary">AI:</span>
            <span className="text-soc-textPrimary font-semibold">{aiEnabled ? 'Active & Healthy' : 'Disabled by policy'}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[11px]">Next Audit: <strong className="text-soc-textPrimary">16 May 2026</strong></span>
          <span className="text-[11px] px-2 py-0.5 rounded bg-soc-secondaryCard border border-soc-border text-soc-textPrimary font-mono">
            v2026.4.2
          </span>
        </div>
      </div>
    </div>
  );
};
