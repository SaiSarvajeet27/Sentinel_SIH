import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  ShieldAlert,
  Lock,
  Radio,
  Flame,
} from 'lucide-react';
import { liveThreatSimulationService } from '../services/liveThreatSimulationService';
import {
  LiveSimulationState,
} from '../types/liveSimulation';
import { LivePipelineVisualizer } from '../components/live-simulation/LivePipelineVisualizer';
import { LiveTelemetryPanel } from '../components/live-simulation/LiveTelemetryPanel';
import { LiveSigmaPanel } from '../components/live-simulation/LiveSigmaPanel';
import { LiveAIEvaluationPanel } from '../components/live-simulation/LiveAIEvaluationPanel';
import { LiveIncidentRecommendationPanel } from '../components/live-simulation/LiveIncidentRecommendationPanel';
import { LiveApprovalInterlockPanel } from '../components/live-simulation/LiveApprovalInterlockPanel';
import { LiveResponseExecutionPanel } from '../components/live-simulation/LiveResponseExecutionPanel';
import { LiveAuditTrailPanel } from '../components/live-simulation/LiveAuditTrailPanel';
import { useSOC } from '../components/common/SOCContext';
import clsx from 'clsx';

export const LiveThreatSimulationPage: React.FC = () => {
  const [simState, setSimState] = useState<LiveSimulationState>(() =>
    liveThreatSimulationService.getState()
  );
  const { authUser } = useSOC();
  const activeAnalystName = authUser
    ? `${authUser.name} (${authUser.role})`
    : 'admin@sentinel.local (SOC Manager)';

  useEffect(() => {
    const unsubscribe = liveThreatSimulationService.subscribe((state: LiveSimulationState) => {
      setSimState(state);
    });
    return unsubscribe;
  }, []);

  const isIdle = simState.status === 'IDLE';
  const isRunning = simState.status === 'RUNNING';
  const isPaused = simState.status === 'PAUSED';
  const isWaitingApproval = simState.status === 'WAITING_FOR_APPROVAL';
  const isCompleted = simState.status === 'COMPLETED';
  const isHalted = simState.status === 'HALTED';

  const currentStageConfig = simState.stages.find((s) => s.id === simState.currentStage);

  return (
    <div className="space-y-5 font-sans pb-10 transition-colors">
      {/* 1. COMMAND HEADER & CONTROLS */}
      <div className="p-4 sm:p-5 rounded-2xl bg-soc-card border border-soc-border shadow-sm space-y-4">
        {/* Title, Subtitle, Badges */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 flex items-center gap-1">
                <Flame className="w-3 h-3" />
                Round 2 Key Feature
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-soc-accent border border-blue-500/20">
                SIMULATION / DEMO MODE
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-soc-textPrimary tracking-tight flex items-center gap-2">
              LIVE THREAT RESPONSE DEMO
            </h1>
            <p className="text-xs text-soc-textSecondary">
              End-to-end detection, AI evaluation, human authorization and governed response
            </p>
          </div>

          {/* Current Status & Stage Pill */}
          <div className="flex items-center gap-2">
            <div className="px-3.5 py-2 rounded-xl bg-soc-secondaryCard border border-soc-border text-right space-y-0.5">
              <div className="text-[10px] uppercase font-bold text-soc-textMuted tracking-wider">
                CURRENT STAGE
              </div>
              <div className="text-xs font-extrabold text-soc-textPrimary flex items-center gap-1.5 justify-end">
                {isWaitingApproval ? (
                  <span className="text-amber-600 dark:text-amber-400 font-black animate-pulse flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" />
                    Human Authorization Required
                  </span>
                ) : (
                  <span>{currentStageConfig?.label || 'Ready to Start'}</span>
                )}
              </div>
            </div>

            <div className="px-3 py-2 rounded-xl bg-soc-secondaryCard border border-soc-border text-right space-y-0.5">
              <div className="text-[10px] uppercase font-bold text-soc-textMuted tracking-wider">
                ELAPSED
              </div>
              <div className="text-xs font-mono font-bold text-soc-textPrimary">
                {simState.elapsedSeconds}s
              </div>
            </div>
          </div>
        </div>

        {/* CONTROLS STRIP */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-soc-border">
          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {isIdle || isCompleted || isHalted ? (
              <button
                onClick={() => liveThreatSimulationService.startSimulation()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-900/30 transition-all hover:scale-105 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Start Live Threat Simulation</span>
              </button>
            ) : isPaused ? (
              <button
                onClick={() => liveThreatSimulationService.resumeSimulation()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all hover:scale-105 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Resume Simulation</span>
              </button>
            ) : isWaitingApproval ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-bold text-xs animate-pulse">
                <Lock className="w-3.5 h-3.5" />
                <span>Interlock: Action Required Below</span>
              </div>
            ) : (
              <button
                onClick={() => liveThreatSimulationService.pauseSimulation()}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-soc-card border border-soc-border hover:bg-soc-cardHover text-soc-textPrimary font-semibold text-xs transition-colors cursor-pointer"
              >
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </button>
            )}

            {/* Reset Button */}
            <button
              onClick={() => liveThreatSimulationService.resetSimulation()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-soc-secondaryCard border border-soc-border hover:bg-soc-cardHover text-soc-textSecondary hover:text-soc-textPrimary text-xs font-semibold transition-colors cursor-pointer"
              title="Reset the simulation to its initial state"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Demo</span>
            </button>
          </div>

          {/* Replay Speed & Scenario Info */}
          <div className="flex items-center gap-3">
            {/* Speed Selector */}
            <div className="flex items-center gap-1 bg-soc-secondaryCard p-1 rounded-xl border border-soc-border text-xs">
              <span className="text-[10px] text-soc-textMuted px-1.5 font-semibold flex items-center gap-1">
                <FastForward className="w-3 h-3" />
                Speed:
              </span>
              {([0.5, 1, 2, 4] as const).map((spd) => (
                <button
                  key={spd}
                  onClick={() => liveThreatSimulationService.setSpeed(spd)}
                  className={clsx(
                    'px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer',
                    simState.speed === spd
                      ? 'bg-soc-accent text-white shadow-sm'
                      : 'text-soc-textSecondary hover:text-soc-textPrimary'
                  )}
                >
                  {spd}x
                </button>
              ))}
            </div>

            {/* Scenario Badge */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-soc-secondaryCard border border-soc-border text-[11px] text-soc-textSecondary">
              <Radio className="w-3 h-3 text-soc-accent" />
              <span>Scenario: <strong>Phishing → Identity Abuse</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. THE 9-STAGE VISUAL PIPELINE */}
      <LivePipelineVisualizer
        stages={simState.stages}
        currentStageId={simState.currentStage}
      />

      {/* 3. CORE SOC DUAL-COLUMN MULTI-PANEL VIEW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT COLUMN: Telemetry, Rule Detection, AI Evaluation */}
        <div className="space-y-5">
          {/* Stage 1 & 2: Telemetry Ingestion & Normalization */}
          <LiveTelemetryPanel
            event={simState.event}
            processedTelemetry={simState.processedTelemetry}
            isProcessing={simState.currentStage === 'EVENT_GENERATED' || simState.currentStage === 'EVENT_PROCESSED'}
          />

          {/* Stage 3: Sigma Rule Detection */}
          <LiveSigmaPanel
            detection={simState.sigmaDetection}
            isProcessing={simState.currentStage === 'SIGMA_DETECTED'}
          />

          {/* Stage 4: AI Threat Evaluation */}
          <LiveAIEvaluationPanel
            evaluation={simState.aiEvaluation}
            isProcessing={simState.currentStage === 'AI_EVALUATED'}
          />
        </div>

        {/* RIGHT COLUMN: Incident, Response Recommendation, Human Interlock, Response Execution */}
        <div className="space-y-5">
          {/* Stage 5 & 6: Incident Creation & Response Recommendation */}
          <LiveIncidentRecommendationPanel
            incident={simState.incident}
            recommendation={simState.recommendation}
            isProcessing={simState.currentStage === 'INCIDENT_CREATED' || simState.currentStage === 'RESPONSE_RECOMMENDED'}
          />

          {/* Stage 7: Human Approval Interlock (CRITICAL) */}
          <LiveApprovalInterlockPanel
            isWaitingForApproval={isWaitingApproval}
            recommendation={simState.recommendation}
            incident={simState.incident}
            aiEvaluation={simState.aiEvaluation}
            approvalDecision={simState.approvalDecision}
            activeAnalystName={activeAnalystName}
            onApprove={(name?: string) => liveThreatSimulationService.handleApprove(name)}
            onReject={(reason: string, name?: string) => liveThreatSimulationService.handleReject(reason, name)}
            onOverride={(action: string, reason: string, name?: string) => liveThreatSimulationService.handleOverride(action, reason, name)}
            onEscalate={(escalateTo: string, reason: string, name?: string) => liveThreatSimulationService.handleEscalate(escalateTo, reason, name)}
          />

          {/* Stage 8: Response Execution */}
          <LiveResponseExecutionPanel
            executionResult={simState.executionResult}
            isProcessing={simState.currentStage === 'RESPONSE_EXECUTED'}
          />
        </div>
      </div>

      {/* 4. BOTTOM FULL-WIDTH LIVE AUDIT TRAIL (Stage 9) */}
      <LiveAuditTrailPanel auditTrail={simState.auditTrail} />

      {/* 5. SOC GOVERNANCE DIFFERENTIATOR STRIP */}
      <div className="p-3.5 rounded-xl bg-soc-card border border-soc-border flex flex-wrap items-center justify-between gap-3 text-xs text-soc-textSecondary shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-soc-accent" />
          <span className="text-soc-textPrimary font-bold">Sentinel SOC Core Governance:</span>
          <span>AI recommends · Human authorizes · System executes · Everything is audited</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span>Determinism: 100% Reliable Demo Mode</span>
        </div>
      </div>
    </div>
  );
};
