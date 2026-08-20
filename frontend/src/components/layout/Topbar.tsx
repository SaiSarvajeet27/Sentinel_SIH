import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, HelpCircle, ChevronDown, LogOut, Radio, Cpu, Sun, Moon, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { DemoStep } from '../../services/realtimeService';
import { useSOC } from '../common/SOCContext';
import { useTheme } from '../common/ThemeContext';
import { GlobalSearchModal } from '../common/GlobalSearchModal';

interface Props {
  currentDemoStep?: DemoStep;
  isDemoRunning?: boolean;
}

const NOTIF_ICON = { success: CheckCircle2, error: AlertCircle, warning: AlertTriangle, info: Info };
const NOTIF_COLOR = {
  success: 'text-emerald-500', error: 'text-red-500',
  warning: 'text-amber-500', info: 'text-soc-accent',
};

export const Topbar: React.FC<Props> = ({ isDemoRunning = false }) => {
  const navigate = useNavigate();
  const { authUser, logout, aiEnabled, notifications } = useSOC();
  const { theme, toggleTheme } = useTheme();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <header className="h-14 bg-soc-header border-b border-soc-border px-5 flex items-center justify-between sticky top-0 z-30 select-none font-sans transition-colors">
        {/* Left: Brand/Live status */}
        <div className="flex items-center gap-3">
          {isDemoRunning && (
            <div
              title="A new incident scenario is being generated and analyzed in the background"
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-soc-card border border-soc-border shadow-sm text-xs font-semibold text-soc-ai"
            >
              <Radio className="w-3 h-3 animate-pulse" />
              <span>Live: New Incident Generating…</span>
            </div>
          )}

          {/* AI AGENT STATUS BADGE */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-soc-card border border-soc-border text-[11px] text-soc-textSecondary shadow-sm">
            <Cpu className="w-3.5 h-3.5 text-soc-ai" />
            <span className="font-semibold text-soc-textPrimary">AI AGENT:</span>
            <span className="text-emerald-500 font-bold">{aiEnabled ? 'ACTIVE' : 'STANDBY'}</span>
          </div>
        </div>

        {/* Center: Search input */}
        <div className="flex-1 max-w-lg mx-4">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="w-full flex items-center justify-between px-3.5 py-1.5 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textSecondary hover:border-soc-borderLight hover:text-soc-textPrimary transition-colors text-xs shadow-sm"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-soc-textSecondary" />
              <span className="truncate">Search alerts, users, devices, IPs, hashes...</span>
            </div>
            <kbd className="px-1.5 py-0.5 rounded bg-soc-card border border-soc-border text-[10px] text-soc-textMuted font-mono">
              Ctrl + K
            </kbd>
          </button>
        </div>

        {/* Right: Theme Toggle, Notifications, Help, User Profile */}
        <div className="flex items-center gap-2.5">
          {/* THEME TOGGLE (Sun/Moon) */}
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-lg bg-soc-card border border-soc-border text-soc-textSecondary hover:text-soc-textPrimary hover:bg-soc-cardHover transition-colors shadow-sm"
            title={theme === 'dark' ? 'Switch to Light Mode (Daylight)' : 'Switch to Dark Mode'}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-600 hover:-rotate-12 transition-transform" />
            )}
          </button>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => {
                setIsNotifOpen(!isNotifOpen);
                setIsProfileMenuOpen(false);
              }}
              className="relative p-1.5 rounded-lg bg-soc-card border border-soc-border text-soc-textSecondary hover:text-soc-textPrimary hover:bg-soc-cardHover transition-colors shadow-sm"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-soc-card border border-soc-border rounded-xl shadow-soc-card py-1.5 z-50">
                <div className="px-4 py-2 border-b border-soc-border flex items-center justify-between">
                  <p className="text-xs font-semibold text-soc-textPrimary">Notifications</p>
                  <span className="text-[10px] text-soc-textMuted">{notifications.length} recent</span>
                </div>
                {notifications.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[11px] text-soc-textMuted">
                    No notifications yet.
                  </div>
                ) : (
                  notifications.slice(0, 20).map((n) => {
                    const Icon = NOTIF_ICON[n.type] || Info;
                    return (
                      <div
                        key={n.id}
                        className="px-4 py-2.5 border-b border-soc-border last:border-b-0 hover:bg-soc-cardHover flex items-start gap-2.5"
                      >
                        <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${NOTIF_COLOR[n.type] || 'text-soc-accent'}`} />
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-soc-textPrimary truncate">{n.title}</p>
                          {n.message && (
                            <p className="text-[10px] text-soc-textSecondary line-clamp-2">{n.message}</p>
                          )}
                          <p className="text-[9px] text-soc-textMuted mt-0.5">
                            {new Date(n.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* AI Safety shortcut */}
          <button
            onClick={() => navigate('/rules')}
            className="p-1.5 rounded-lg bg-soc-card border border-soc-border text-soc-textSecondary hover:text-soc-textPrimary hover:bg-soc-cardHover transition-colors shadow-sm"
            title="AI Safety & Guardrails"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* User Profile */}
          <div className="relative">
            <button
              onClick={() => {
                setIsProfileMenuOpen(!isProfileMenuOpen);
                setIsNotifOpen(false);
              }}
              className="flex items-center gap-2.5 p-1 pr-2 rounded-lg bg-soc-card border border-soc-border hover:border-soc-borderLight transition-all shadow-sm"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 to-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-sm">
                {authUser?.avatarInitials || '?'}
              </div>
              <div className="text-left hidden sm:block leading-tight">
                <div className="text-xs font-semibold text-soc-textPrimary">{authUser?.name || 'Guest'}</div>
                <div className="text-[10px] text-soc-textSecondary">{authUser?.role || 'Analyst'}</div>
              </div>
              <ChevronDown className="w-3 h-3 text-soc-textSecondary" />
            </button>

            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-soc-card border border-soc-border rounded-xl shadow-soc-card py-1.5 z-50">
                <div className="px-4 py-2 border-b border-soc-border">
                  <p className="text-xs font-semibold text-soc-textPrimary">{authUser?.name || 'Guest'}</p>
                  <p className="text-[10px] text-soc-textMuted">{authUser?.role || 'Not signed in'}</p>
                </div>
                
                {/* Mode toggle inside menu as well */}
                <button
                  onClick={toggleTheme}
                  className="w-full text-left px-4 py-2 text-xs text-soc-textSecondary hover:text-soc-textPrimary hover:bg-soc-cardHover flex items-center justify-between"
                >
                  <span>Theme Mode</span>
                  <span className="font-semibold capitalize text-soc-accent">{theme}</span>
                </button>

                <button
                  onClick={() => {
                    navigate('/settings');
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-soc-textSecondary hover:text-soc-textPrimary hover:bg-soc-cardHover"
                >
                  Settings & Autonomy
                </button>
                <button
                  onClick={() => {
                    navigate('/rules');
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-soc-textSecondary hover:text-soc-textPrimary hover:bg-soc-cardHover"
                >
                  Analyst Feedback
                </button>
                <div className="border-t border-soc-border my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-4 py-2 text-xs text-red-500 hover:bg-soc-cardHover flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Search Command Palette Modal */}
      <GlobalSearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
};

