import React from 'react';
import {
  Radio,
  FileCheck,
  ShieldAlert,
  Sparkles,
  FolderPlus,
  PlaySquare,
  Lock,
  Zap,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  CornerUpRight,
  ArrowUpRight,
} from 'lucide-react';
import { PipelineStageConfig, PipelineStageId, StageStatus } from '../../types/liveSimulation';
import clsx from 'clsx';

interface Props {
  stages: PipelineStageConfig[];
  currentStageId: PipelineStageId;
  onSelectStage?: (stageId: PipelineStageId) => void;
}

const STAGE_ICON_MAP: Record<PipelineStageId, React.ElementType> = {
  EVENT_GENERATED: Radio,
  EVENT_PROCESSED: FileCheck,
  SIGMA_DETECTED: ShieldAlert,
  AI_EVALUATED: Sparkles,
  INCIDENT_CREATED: FolderPlus,
  RESPONSE_RECOMMENDED: PlaySquare,
  HUMAN_APPROVAL: Lock,
  RESPONSE_EXECUTED: Zap,
  AUDIT_RECORDED: FileText,
};

export const LivePipelineVisualizer: React.FC<Props> = ({
  stages,
  currentStageId,
  onSelectStage,
}) => {
  const getStatusBadge = (status: StageStatus) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Done
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/30 animate-pulse">
            <Radio className="w-3 h-3 animate-spin" />
            Active
          </span>
        );
      case 'WAITING_FOR_APPROVAL':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/40 animate-pulse">
            <Clock className="w-3 h-3" />
            Interlock
          </span>
        );
      case 'REJECTED':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/30">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      case 'OVERRIDDEN':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/30">
            <CornerUpRight className="w-3 h-3" />
            Overridden
          </span>
        );
      case 'ESCALATED':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/30">
            <ArrowUpRight className="w-3 h-3" />
            Escalated
          </span>
        );
      case 'FAILED':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-500/10 px-1.5 py-0.5 rounded border border-slate-500/20">
            <AlertCircle className="w-3 h-3" />
            Skipped
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="text-[10px] font-medium text-soc-textMuted bg-soc-secondaryCard px-1.5 py-0.5 rounded border border-soc-border">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="w-full bg-soc-card border border-soc-border rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-soc-accent animate-pulse" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-soc-textPrimary">
            End-to-End Threat Response Pipeline
          </h2>
        </div>
        <span className="text-[11px] text-soc-textSecondary font-medium">
          9-Stage Autonomous & Governed Flow
        </span>
      </div>

      {/* Horizontal Desktop / Scrollable Pipeline */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-9 gap-2">
        {stages.map((stage) => {
          const IconComponent = STAGE_ICON_MAP[stage.id] || Radio;
          const isCurrent = stage.id === currentStageId;
          const isCompleted = stage.status === 'COMPLETED';
          const isInterlock = stage.status === 'WAITING_FOR_APPROVAL';
          const isProcessing = stage.status === 'PROCESSING';

          return (
            <button
              key={stage.id}
              onClick={() => onSelectStage?.(stage.id)}
              className={clsx(
                'flex flex-col justify-between text-left p-2.5 rounded-lg border transition-all duration-200 relative overflow-hidden group',
                isCurrent && 'ring-2 ring-soc-accent ring-offset-1 ring-offset-soc-bg',
                isInterlock
                  ? 'bg-amber-500/10 border-amber-500/50 shadow-sm'
                  : isProcessing
                  ? 'bg-blue-500/10 border-blue-500/50 shadow-sm'
                  : isCompleted
                  ? 'bg-emerald-500/5 border-emerald-500/30'
                  : 'bg-soc-secondaryCard border-soc-border hover:border-soc-borderLight'
              )}
            >
              {/* Top Row: Step Index & Status Badge */}
              <div className="flex items-center justify-between w-full mb-2">
                <span className="text-[10px] font-mono font-bold text-soc-textSecondary">
                  0{stage.order}
                </span>
                {getStatusBadge(stage.status)}
              </div>

              {/* Icon & Label */}
              <div className="space-y-1 my-1">
                <div className="flex items-center gap-1.5">
                  <div
                    className={clsx(
                      'p-1 rounded-md shrink-0',
                      isInterlock
                        ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                        : isCompleted
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : isProcessing
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        : 'bg-soc-card text-soc-textSecondary'
                    )}
                  >
                    <IconComponent className="w-3.5 h-3.5" />
                  </div>
                  <span
                    className={clsx(
                      'text-xs font-bold leading-tight truncate',
                      isInterlock
                        ? 'text-amber-700 dark:text-amber-300'
                        : isCompleted
                        ? 'text-soc-textPrimary'
                        : isProcessing
                        ? 'text-soc-accent'
                        : 'text-soc-textSecondary'
                    )}
                  >
                    {stage.label}
                  </span>
                </div>
                <p className="text-[10px] text-soc-textMuted line-clamp-2 leading-snug">
                  {stage.shortDesc}
                </p>
              </div>

              {/* Timestamp footer if available */}
              <div className="mt-2 pt-1 border-t border-soc-border/50 text-[9px] font-mono text-soc-textMuted flex items-center justify-between w-full">
                <span>{stage.timestamp || '—'}</span>
                {isCompleted && <span className="text-emerald-500 font-bold">✓</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
