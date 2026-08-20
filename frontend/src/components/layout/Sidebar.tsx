import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  ShieldAlert,
  CheckSquare,
  FileText,
  Sliders,
  Settings,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { useSOC } from '../common/SOCContext';
import { useTheme } from '../common/ThemeContext';

export const Sidebar: React.FC = () => {
  const { pendingApprovals, metrics, dashboardExtras } = useSOC();
  const { theme } = useTheme();

  const pendingCount = pendingApprovals.length;
  const criticalCount = metrics.criticalThreats;
  const healthScore = dashboardExtras.systemHealthScore;

  const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    {
      path: '/incidents',
      label: 'Incidents',
      icon: ShieldAlert,
      badge: criticalCount > 0 ? `${criticalCount}` : undefined,
      badgeColor: 'bg-red-500 text-white',
    },
    {
      path: '/approvals',
      label: 'Approvals',
      icon: CheckSquare,
      badge: pendingCount > 0 ? `${pendingCount}` : undefined,
      badgeColor: 'bg-orange-500 text-white',
    },
    { path: '/rules', label: 'Trust & Rules', icon: Sliders },
    { path: '/evidence', label: 'Evidence & Audit', icon: FileText },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-56 bg-soc-sidebar border-r border-soc-border flex flex-col h-screen shrink-0 sticky top-0 select-none z-20 font-sans transition-colors">
      {/* Branding Header */}
      <div className="p-4 border-b border-soc-border flex items-center gap-3">
        <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 shadow-glow-cyan text-white shrink-0">
          <Shield className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="font-bold text-soc-textPrimary tracking-tight text-sm flex items-center gap-1 truncate">
            SOC Platform
          </h1>
          <p className="text-[10px] text-soc-textSecondary leading-tight truncate">AI-Powered Security Operations</p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all duration-150 group ${
                isActive
                  ? theme === 'dark'
                    ? 'bg-[#1683FF] text-white font-semibold shadow-md shadow-blue-900/40'
                    : 'bg-white text-[#1677FF] font-semibold border border-[#DCE5EF] shadow-sm'
                  : 'text-soc-textSecondary hover:text-soc-textPrimary hover:bg-soc-cardHover'
              }`
            }
          >
            <div className="flex items-center gap-2.5 truncate">
              <item.icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
              <span className="truncate">{item.label}</span>
            </div>

            {item.badge && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold leading-none ${item.badgeColor}`}>
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom System Health Widget */}
      <div className="p-3 border-t border-soc-border bg-soc-sidebar">
        <div className="p-3 rounded-xl bg-soc-card border border-soc-border space-y-2 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-semibold text-soc-textPrimary">System Health</span>
          </div>
          <p className="text-[10px] text-soc-textSecondary">{healthScore === 100 ? 'All systems operational' : 'Degraded — check Settings'}</p>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-soc-textSecondary font-mono">
              <span>Status</span>
              <span className="text-emerald-500 font-bold">{healthScore}%</span>
            </div>
            <div className="w-full bg-soc-bg border border-soc-border rounded-full h-1.5 overflow-hidden">
              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${healthScore}%` }} />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
