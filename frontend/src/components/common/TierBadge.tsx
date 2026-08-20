import React from 'react';
import { AuthorizationTier } from '../../types/soc';
import { Shield, ShieldAlert, ShieldCheck, Lock } from 'lucide-react';

interface Props {
  tier?: AuthorizationTier;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const TierBadge: React.FC<Props> = ({ tier = 'TIER_2', size = 'md', showLabel = true }) => {
  const getTierDetails = () => {
    switch (tier) {
      case 'TIER_0':
        return {
          label: 'TIER 0',
          desc: 'Read-only / Informational',
          bg: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900/90 dark:text-slate-300 dark:border-slate-700',
          icon: Shield,
        };
      case 'TIER_1':
        return {
          label: 'TIER 1',
          desc: 'Low-impact / Auto-eligible',
          bg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/90 dark:text-blue-400 dark:border-blue-800',
          icon: ShieldCheck,
        };
      case 'TIER_2':
        return {
          label: 'TIER 2',
          desc: 'Disruptive / Single Approval Required',
          bg: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/90 dark:text-amber-400 dark:border-amber-700',
          icon: ShieldAlert,
        };
      case 'TIER_3':
        return {
          label: 'TIER 3',
          desc: 'High-Impact / Two Approvers Required',
          bg: 'bg-purple-50 text-purple-800 border-purple-200 dark:bg-purple-950/90 dark:text-purple-300 dark:border-purple-700 shadow-glow-purple animate-pulse-slow',
          icon: Lock,
        };
    }
  };

  const details = getTierDetails();
  const Icon = details.icon;

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-[10px]'
      : size === 'lg'
      ? 'px-3 py-1.5 text-xs font-bold'
      : 'px-2.5 py-1 text-[11px]';

  return (
    <span
      title={details.desc}
      className={`inline-flex items-center gap-1.5 rounded border font-mono font-bold tracking-wide uppercase transition-all ${details.bg} ${sizeClasses}`}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span>{details.label}</span>
      {showLabel && size !== 'sm' && <span className="opacity-75 text-[10px]">({details.desc.split(' / ')[0]})</span>}
    </span>
  );
};
