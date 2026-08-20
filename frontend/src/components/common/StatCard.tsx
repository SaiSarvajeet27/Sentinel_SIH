import React from 'react';
import { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'critical' | 'high' | 'medium' | 'info' | 'purple' | 'emerald';
  trend?: string;
  isAlert?: boolean;
}

export const StatCard: React.FC<Props> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'info',
  trend,
  isAlert = false,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'critical':
        return {
          card: 'border-red-200 dark:border-red-900/60 bg-gradient-to-br from-red-500/10 dark:from-red-950/25 via-soc-card to-soc-card',
          iconWrap: 'bg-red-100 border-red-200 text-red-600 dark:bg-red-950/50 dark:border-red-800/80 dark:text-red-400',
          accent: 'text-red-600 dark:text-red-400',
        };
      case 'high':
        return {
          card: 'border-orange-200 dark:border-orange-900/60 bg-gradient-to-br from-orange-500/10 dark:from-orange-950/25 via-soc-card to-soc-card',
          iconWrap: 'bg-orange-100 border-orange-200 text-orange-600 dark:bg-orange-950/50 dark:border-orange-800/80 dark:text-orange-400',
          accent: 'text-orange-600 dark:text-orange-400',
        };
      case 'medium':
        return {
          card: 'border-amber-200 dark:border-amber-900/60 bg-gradient-to-br from-amber-500/10 dark:from-amber-950/25 via-soc-card to-soc-card',
          iconWrap: 'bg-amber-100 border-amber-200 text-amber-600 dark:bg-amber-950/50 dark:border-amber-800/80 dark:text-amber-400',
          accent: 'text-amber-600 dark:text-amber-400',
        };
      case 'purple':
        return {
          card: 'border-purple-200 dark:border-purple-900/60 bg-gradient-to-br from-purple-500/10 dark:from-purple-950/25 via-soc-card to-soc-card',
          iconWrap: 'bg-purple-100 border-purple-200 text-purple-700 dark:bg-purple-950/50 dark:border-purple-800/80 dark:text-purple-300',
          accent: 'text-purple-700 dark:text-purple-300',
        };
      case 'emerald':
        return {
          card: 'border-emerald-200 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-500/10 dark:from-emerald-950/25 via-soc-card to-soc-card',
          iconWrap: 'bg-emerald-100 border-emerald-200 text-emerald-600 dark:bg-emerald-950/50 dark:border-emerald-800/80 dark:text-emerald-400',
          accent: 'text-emerald-600 dark:text-emerald-400',
        };
      case 'info':
      default:
        return {
          card: 'border-soc-border bg-soc-card',
          iconWrap: 'bg-blue-100 border-blue-200 text-soc-accent dark:bg-cyan-950/40 dark:border-cyan-800/60 dark:text-soc-accent',
          accent: 'text-soc-accent',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div
      className={`relative p-4 rounded-xl border transition-all duration-200 hover:border-soc-borderLight ${styles.card} ${
        isAlert ? 'shadow-glow-red animate-pulse-slow' : 'shadow-soc-card'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-soc-textMuted font-mono truncate">{title}</span>
        <div className={`p-2 rounded-lg border ${styles.iconWrap} shrink-0`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-2.5 flex items-baseline justify-between">
        <span className="text-2xl lg:text-3xl font-extrabold font-mono tracking-tight text-soc-textPrimary">{value}</span>
        {trend && <span className="text-[11px] font-mono text-soc-cyan font-semibold">{trend}</span>}
      </div>

      {subtitle && <p className="mt-1 text-[11px] text-soc-textMuted truncate font-sans">{subtitle}</p>}
    </div>
  );
};
