import React, { useState } from 'react';
import { Settings, User, Bell, Terminal, Save, Check, Sliders, Lock, ShieldCheck, Sun, Moon } from 'lucide-react';
import { useSOC } from '../components/common/SOCContext';
import { useTheme } from '../components/common/ThemeContext';
import { AutonomyMode } from '../types/soc';
import { AIStatusBadge } from '../components/common/AIStatusBadge';
import { API_BASE } from '../services/backendApi';

export const SettingsPage: React.FC = () => {
  const { autonomyMode, setAutonomyMode, authUser } = useSOC();
  const { theme, setTheme } = useTheme();
  const [saved, setSaved] = useState(false);
  const wsBase = API_BASE.replace(/^http/, 'ws');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const autonomyOptions: {
    mode: AutonomyMode;
    title: string;
    description: string;
    badgeText?: string;
    isDisabled?: boolean;
  }[] = [
    {
      mode: 'ALWAYS_ASK',
      title: 'ALWAYS ASK',
      description: 'Every action requires human confirmation before execution regardless of risk score or tier.',
    },
    {
      mode: 'RECOMMEND_ONLY',
      title: 'RECOMMEND ONLY',
      description: 'AI/system recommends actions and playbook steps but does not execute them under any condition.',
    },
    {
      mode: 'ACT_AND_NOTIFY',
      title: 'ACT & NOTIFY',
      description: 'Only eligible low-risk / Tier-1 pre-approved actions may execute automatically, and the analyst is immediately notified.',
    },
    {
      mode: 'FULL_AUTO_DISABLED',
      title: 'FULL AUTO',
      description: 'Disabled by governance policy. Unattended high-impact response actions are strictly prohibited.',
      badgeText: '🔒 Disabled by Policy',
      isDisabled: true,
    },
  ];

  return (
    <div className="space-y-5 font-sans transition-colors">
      {/* Header Banner */}
      <div className="p-4 rounded-xl bg-soc-card border border-soc-border flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-soc-textPrimary tracking-tight flex items-center gap-2">
            <Settings className="w-4 h-4 text-soc-accent" />
            GOVERNANCE & SYSTEM PREFERENCES
          </h1>
          <p className="text-xs text-soc-textSecondary mt-0.5">
            Configure global SOC autonomy modes, authorization tiers, and interface theme
          </p>
        </div>

        {saved && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-semibold text-xs shadow-sm">
            <Check className="w-3.5 h-3.5" />
            <span>Preferences Saved</span>
          </div>
        )}
      </div>

      {/* THEME PREFERENCE SECTION */}
      <div className="p-5 rounded-xl bg-soc-card border border-soc-border space-y-3.5 shadow-sm">
        <div className="flex items-center justify-between border-b border-soc-border pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/15 text-soc-accent">
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-500" />}
            </div>
            <div>
              <h2 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider">
                VISUAL INTERFACE THEME
              </h2>
              <p className="text-soc-textSecondary text-[11px]">
                Choose between the deep midnight SOC theme or the clean enterprise daylight theme
              </p>
            </div>
          </div>

          <span className="px-2.5 py-1 rounded-full bg-soc-secondaryCard border border-soc-border text-xs font-bold text-soc-accent">
            Current: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          {/* Dark Mode Tile */}
          <div
            onClick={() => setTheme('dark')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none flex items-start gap-3 ${
              theme === 'dark'
                ? 'bg-[#050B16] border-soc-accent shadow-glow-blue'
                : 'bg-soc-secondaryCard border-soc-border hover:border-soc-borderLight'
            }`}
          >
            <div className="p-2 rounded-lg bg-[#071426] border border-[#17304A] text-[#1683FF] shrink-0">
              <Moon className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-white">Dark Command Center (Default)</span>
                {theme === 'dark' && <span className="text-[10px] text-emerald-400 font-bold">ACTIVE</span>}
              </div>
              <p className="text-[11px] text-[#94A3B8] mt-1">
                Deep midnight navy palette (#020817) with high-contrast electric blue telemetry for low-light SOC environments.
              </p>
            </div>
          </div>

          {/* Light Mode Tile */}
          <div
            onClick={() => setTheme('light')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none flex items-start gap-3 ${
              theme === 'light'
                ? 'bg-white border-[#1677FF] shadow-md ring-1 ring-[#1677FF]'
                : 'bg-soc-secondaryCard border-soc-border hover:border-soc-borderLight'
            }`}
          >
            <div className="p-2 rounded-lg bg-[#F1F7FF] border border-[#DCE5EF] text-[#1677FF] shrink-0">
              <Sun className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-[#0F172A]">Enterprise Daylight Mode</span>
                {theme === 'light' && <span className="text-[10px] text-[#1677FF] font-bold">ACTIVE</span>}
              </div>
              <p className="text-[11px] text-[#64748B] mt-1">
                Crisp white cards (#FFFFFF) and slate surfaces (#F4F7FB) optimized for bright daylight and executive review.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* AUTONOMY MODE & AI ASSISTANCE CONFIGURATION SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Autonomy Mode Card (2 cols) */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-soc-card border border-soc-border space-y-3.5 text-xs shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-soc-border pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-500/15 text-soc-ai">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider">
                  GLOBAL SYSTEM AUTONOMY MODE
                </h2>
                <p className="text-soc-textSecondary text-[10px]">
                  Determines how autonomous response actions are handled across all SOC pages
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-soc-secondaryCard border border-soc-border text-soc-accent text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Active: {autonomyMode.replace(/_/g, ' ')}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {autonomyOptions.map((opt) => {
              const isSelected = autonomyMode === opt.mode;
              return (
                <div
                  key={opt.mode}
                  onClick={() => !opt.isDisabled && setAutonomyMode(opt.mode)}
                  className={`p-3 rounded-lg border transition-all select-none ${
                    opt.isDisabled
                      ? 'opacity-50 bg-red-500/10 border-red-500/20 cursor-not-allowed'
                      : isSelected
                      ? 'bg-purple-500/15 border-soc-ai shadow-sm cursor-pointer'
                      : 'bg-soc-secondaryCard border border-soc-border hover:border-soc-ai/50 hover:bg-soc-cardHover cursor-pointer'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="autonomyMode"
                        checked={isSelected}
                        disabled={opt.isDisabled}
                        onChange={() => !opt.isDisabled && setAutonomyMode(opt.mode)}
                        className="text-purple-600 focus:ring-0"
                      />
                      <span className="font-bold text-soc-textPrimary text-xs">{opt.title}</span>
                    </div>

                    {opt.badgeText ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/15 text-red-500 border border-red-500/30 flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        {opt.badgeText}
                      </span>
                    ) : isSelected ? (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-soc-ai border border-purple-500/40">
                        Active Policy
                      </span>
                    ) : null}
                  </div>

                  <p className="text-soc-textSecondary text-xs pl-5">{opt.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Assistance Engine Card (1 col) */}
        <div className="p-5 rounded-xl bg-soc-card border border-soc-border space-y-3.5 text-xs flex flex-col justify-between shadow-sm">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-soc-border pb-2.5">
              <h2 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider">
                AI ASSISTANCE ENGINE
              </h2>
              <AIStatusBadge size="sm" />
            </div>

            <p className="text-soc-textSecondary text-xs leading-relaxed">
              AI provides advisory decision support, both-sides rationale, and explainability claims. Security governance rules and human authorization control all high-impact actions.
            </p>

            <div className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-1 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-soc-textSecondary font-bold">Detection & Rules:</span>
                <span className="text-emerald-500 font-bold">ACTIVE</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-soc-textSecondary font-bold">Correlation & Graph:</span>
                <span className="text-emerald-500 font-bold">ACTIVE</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-soc-textSecondary font-bold">Tier Governance:</span>
                <span className="text-emerald-500 font-bold">ACTIVE</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-soc-textSecondary font-bold">Human Approval Queue:</span>
                <span className="text-emerald-500 font-bold">ACTIVE</span>
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-soc-border">
            <AIStatusBadge size="md" />
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
        {/* Analyst Profile */}
        <div className="p-5 rounded-xl bg-soc-card border border-soc-border space-y-3 shadow-sm">
          <h2 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-soc-accent" />
            Analyst Profile & Credentials
          </h2>

          <div className="space-y-2.5 text-soc-textSecondary">
            <div>
              <label className="block text-soc-textMuted text-[10px] font-bold uppercase mb-1">Analyst Name:</label>
              <input
                type="text"
                readOnly
                value={authUser?.name || '—'}
                className="w-full p-2 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textPrimary font-bold text-xs"
              />
            </div>

            <div>
              <label className="block text-soc-textMuted text-[10px] font-bold uppercase mb-1">Role / Governance Authorization:</label>
              <input
                type="text"
                disabled
                value={
                  authUser?.role === 'manager' ? 'Manager (Tier 2 + Tier 3 authorized)'
                  : authUser?.role === 'senior_analyst' ? 'Senior Analyst (Tier 2 authorized)'
                  : authUser?.role === 'analyst' ? 'Analyst (no tier approval authority)'
                  : authUser?.role || '—'
                }
                className="w-full p-2 rounded-lg bg-soc-secondaryCard/60 border border-soc-border text-soc-accent font-bold text-xs"
              />
            </div>
          </div>
        </div>

        {/* Backend API Configuration */}
        <div className="p-5 rounded-xl bg-soc-card border border-soc-border space-y-3 shadow-sm">
          <h2 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-soc-ai" />
            Backend API &amp; WebSocket Connection
          </h2>

          <div className="space-y-2.5 text-soc-textSecondary">
            <div>
              <label className="block text-soc-textMuted text-[10px] font-bold uppercase mb-1">REST API Base Endpoint:</label>
              <input
                type="text"
                readOnly
                value={API_BASE}
                className="w-full p-2 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textPrimary font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-soc-textMuted text-[10px] font-bold uppercase mb-1">WebSocket Stream Endpoint:</label>
              <input
                type="text"
                readOnly
                value={`${wsBase}/ws`}
                className="w-full p-2 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textPrimary font-mono text-xs"
              />
            </div>
            <p className="text-[10px] text-soc-textMuted">
              Set via <code>VITE_API_BASE</code> at build time — not editable here.
            </p>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="p-5 rounded-xl bg-soc-card border border-soc-border space-y-3 lg:col-span-2 shadow-sm">
          <h2 className="text-xs font-bold text-soc-textPrimary uppercase tracking-wider flex items-center gap-2">
            <Bell className="w-3.5 h-3.5 text-amber-500" />
            Alert Notification Triggers
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-soc-textSecondary">
            <label className="flex items-center gap-3 p-3 rounded-lg bg-soc-secondaryCard border border-soc-border cursor-pointer hover:bg-soc-cardHover">
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded text-soc-accent border-soc-border" />
              <div>
                <div className="font-bold text-soc-textPrimary text-xs">Critical Threat Alert Popups</div>
                <div className="text-[11px] text-soc-textSecondary">Trigger immediate sound & visual flash on Critical alerts.</div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-lg bg-soc-secondaryCard border border-soc-border cursor-pointer hover:bg-soc-cardHover">
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded text-soc-accent border-soc-border" />
              <div>
                <div className="font-bold text-soc-textPrimary text-xs">Human Approval Required Banner</div>
                <div className="text-[11px] text-soc-textSecondary">Show pending approval count badge on topbar.</div>
              </div>
            </label>
          </div>
        </div>

        {/* Save Button */}
        <div className="lg:col-span-2 flex justify-end">
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-soc-accent hover:opacity-90 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Preferences</span>
          </button>
        </div>
      </form>
    </div>
  );
};

