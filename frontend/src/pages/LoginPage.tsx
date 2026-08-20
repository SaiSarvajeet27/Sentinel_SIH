import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Lock, User, Key, Info, ShieldCheck, Sun, Moon } from 'lucide-react';
import { useSOC } from '../components/common/SOCContext';
import { useTheme } from '../components/common/ThemeContext';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useSOC();
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState('admin@sentinel.local');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setIsSubmitting(true);
    const ok = await login(email, password);
    setIsSubmitting(false);
    if (ok) {
      navigate('/');
    } else {
      setError('Invalid credentials, or the backend is unreachable at ' + import.meta.env.VITE_API_BASE);
    }
  };

  const handleFillDemo = () => {
    setEmail('admin@sentinel.local');
    setPassword('');
  };

  return (
    <div className="min-h-screen bg-soc-bg text-soc-textPrimary flex items-center justify-center p-4 relative overflow-hidden font-sans transition-colors duration-200">
      {/* Dynamic Background Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-soc-cyan/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-soc-ai/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Right Theme Toggle */}
      <div className="absolute top-5 right-5 z-20">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-soc-card border border-soc-border text-soc-textSecondary hover:text-soc-textPrimary hover:bg-soc-cardHover transition-colors shadow-soc-card"
          title={theme === 'dark' ? 'Switch to Light Mode (Daylight)' : 'Switch to Dark Mode'}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-600 hover:-rotate-12 transition-transform" />
          )}
        </button>
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-soc-card border border-soc-border rounded-xl p-7 shadow-soc-card relative z-10 transition-colors font-sans">
        {/* Branding Header */}
        <div className="text-center space-y-2.5 mb-6">
          <div className="inline-flex items-center justify-center p-2.5 rounded-xl bg-gradient-to-tr from-[#168BFF] to-[#00C6FF] shadow-glow-cyan text-white dark:text-black mb-1">
            <Shield className="w-7 h-7" />
          </div>

          <h1 className="text-xl font-extrabold text-soc-textPrimary tracking-wider flex items-center justify-center gap-1 font-sans">
            SENTINEL<span className="text-soc-accent">-X</span>
          </h1>
          <p className="text-[11px] text-soc-textMuted font-sans">
            Autonomous SOC v2026 — Netra Governance Interlock
          </p>

          {/* Security & Demo Status Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold font-sans">
              <ShieldCheck className="w-3 h-3" />
              <span>Governance Active</span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-[10px] font-bold font-sans">
              <span>DEMO ENVIRONMENT</span>
            </div>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 font-sans">
          {/* Email / Username */}
          <div className="space-y-1 text-xs font-sans">
            <label className="block text-soc-textSecondary font-bold uppercase tracking-wider text-[10px] font-sans">
              Analyst Email / ID
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-soc-textMuted">
                <User className="w-3.5 h-3.5" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="analyst@soc.local"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textPrimary placeholder:text-soc-textMuted focus:border-soc-accent focus:outline-none transition-colors text-xs font-sans"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1 text-xs font-sans">
            <div className="flex items-center justify-between">
              <label className="block text-soc-textSecondary font-bold uppercase tracking-wider text-[10px] font-sans">
                Access Key / Password
              </label>
              <button
                type="button"
                onClick={() => setIsForgotModalOpen(true)}
                className="text-[10px] text-soc-accent hover:underline font-medium font-sans"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-soc-textMuted">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-9 py-2 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textPrimary placeholder:text-soc-textMuted focus:border-soc-accent focus:outline-none transition-colors text-xs font-sans"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-soc-textMuted hover:text-soc-textPrimary transition-colors"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Remember Me & Auth Policy */}
          <div className="flex items-center justify-between text-xs text-soc-textSecondary font-sans">
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-[11px] font-sans">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded bg-soc-secondaryCard border-soc-border text-soc-accent focus:ring-0"
              />
              <span>Remember Device</span>
            </label>
            <span className="text-[10px] text-soc-textMuted font-sans">Live Backend</span>
          </div>

          {error && (
            <div className="text-[11px] text-red-500 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 font-sans">
              {error}
            </div>
          )}

          {/* Sign In Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#168BFF] to-[#00C6FF] hover:brightness-110 text-white dark:text-black font-extrabold text-xs shadow-glow-cyan transition-all flex items-center justify-center gap-2 cursor-pointer font-sans disabled:opacity-60 disabled:cursor-wait"
          >
            <Key className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'AUTHENTICATING…' : 'AUTHENTICATE & ACCESS SOC'}</span>
          </button>
        </form>

        {/* Credentials Helper Box */}
        <div className="mt-5 p-3 rounded-lg bg-soc-secondaryCard border border-soc-border text-xs space-y-1.5 font-sans">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 font-sans">
            <Info className="w-3 h-3" />
            Real backend accounts:
          </div>
          <div className="text-[11px] text-soc-textSecondary space-y-0.5 font-sans">
            <div>Manager: <span className="text-soc-textPrimary font-semibold font-sans">admin@sentinel.local</span></div>
            <div>Senior analyst / analyst: printed once by <code className="text-soc-accent">python scripts/bootstrap.py</code></div>
          </div>
          <button
            type="button"
            onClick={handleFillDemo}
            className="text-soc-accent hover:underline font-bold text-[10px] cursor-pointer font-sans"
          >
            [ Fill manager email ]
          </button>
        </div>

        {/* Footer info */}
        <div className="mt-5 text-center text-[10px] text-soc-textMuted font-sans">
          Human-Governed Autonomous Response System
        </div>
      </div>

      {/* Forgot Password Modal */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
          <div className="bg-soc-card border border-soc-border rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-soc-elevated font-sans">
            <div className="flex items-center justify-between font-sans">
              <h3 className="font-bold text-soc-textPrimary text-sm flex items-center gap-2 font-sans">
                <Info className="w-4 h-4 text-soc-accent" />
                Password Reset Instructions
              </h3>
              <button
                onClick={() => setIsForgotModalOpen(false)}
                className="text-soc-textMuted hover:text-soc-textPrimary transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-soc-textSecondary font-sans leading-relaxed">
              This connects to a real backend with real JWT authentication — there is no bypass. Run <code className="text-soc-accent">python scripts/bootstrap.py</code> against the backend to print three role-based accounts (manager, senior analyst, analyst) with their one-time passwords.
            </p>
            <div className="pt-2 flex justify-end font-sans">
              <button
                onClick={() => {
                  handleFillDemo();
                  setIsForgotModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-soc-accent text-white dark:text-black font-bold text-xs shadow-glow-cyan cursor-pointer font-sans"
              >
                Fill Manager Email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

