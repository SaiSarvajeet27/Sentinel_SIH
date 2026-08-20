import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Pause, ChevronRight, ChevronLeft, RotateCcw, Sparkles } from 'lucide-react';
import { realtimeService, DemoStep } from '../../services/realtimeService';

const TOTAL_STEPS = 7;

interface Props {
  currentStep: DemoStep;
  isRunning: boolean;
}

export const DemoControlBanner: React.FC<Props> = ({ currentStep, isRunning }) => {
  const navigate = useNavigate();

  // Auto-navigate to active page when step changes during running demo
  useEffect(() => {
    if (isRunning && currentStep.activeRoute) {
      navigate(currentStep.activeRoute);
    }
  }, [currentStep.stepIndex, currentStep.activeRoute, isRunning, navigate]);

  const handleNext = () => realtimeService.nextStep();
  const handlePrev = () => realtimeService.prevStep();
  const handleToggle = () => (isRunning ? realtimeService.pauseDemo() : realtimeService.startDemo());
  const handleReset = () => realtimeService.resetDemo();

  return (
    <div className="bg-soc-header border-b border-soc-border px-5 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-sans shadow-sm z-20 transition-colors">
      {/* Step Indicator & Info */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-soc-ai font-bold uppercase tracking-wider text-[11px]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>DEMO:</span>
        </div>

        <div className="px-2 py-0.5 rounded bg-soc-ai/15 border border-soc-ai/30 text-soc-ai font-bold text-[10px]">
          Step {currentStep.stepIndex + 1} / {TOTAL_STEPS}
        </div>

        <div className="text-soc-textPrimary font-bold tracking-tight text-xs">{currentStep.title}</div>
      </div>

      {/* Progress Dots — display only. The backend demo is forward-only,
          driven by events it has actually ingested, so a dot cannot jump
          backward the way the old local timer could. */}
      <div className="hidden md:flex items-center gap-1.5">
        {Array.from({ length: TOTAL_STEPS }, (_, idx) => (
          <span
            key={idx}
            className={`w-2 h-2 rounded-full transition-all ${
              idx === currentStep.stepIndex
                ? 'bg-soc-accent scale-125 shadow-glow-cyan'
                : idx < currentStep.stepIndex
                ? 'bg-soc-ai'
                : 'bg-soc-border'
            }`}
          />
        ))}
      </div>

      {/* Control Buttons */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={handlePrev}
          disabled={currentStep.stepIndex === 0}
          className="p-1 rounded-lg bg-soc-card border border-soc-border hover:bg-soc-cardHover disabled:opacity-40 text-soc-textSecondary hover:text-soc-textPrimary transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleToggle}
          className="px-2.5 py-1 rounded-lg bg-soc-ai/15 hover:bg-soc-ai/25 border border-soc-ai/30 text-soc-ai font-semibold flex items-center gap-1 text-xs transition-colors cursor-pointer"
        >
          {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          <span>{isRunning ? 'Pause' : 'Play'}</span>
        </button>

        <button
          onClick={handleNext}
          disabled={currentStep.stepIndex === TOTAL_STEPS - 1}
          className="p-1 rounded-lg bg-soc-card border border-soc-border hover:bg-soc-cardHover disabled:opacity-40 text-soc-textSecondary hover:text-soc-textPrimary transition-colors cursor-pointer"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleReset}
          className="p-1 rounded-lg bg-soc-card border border-soc-border hover:bg-soc-cardHover text-soc-textSecondary hover:text-soc-textPrimary ml-0.5 transition-colors cursor-pointer"
          title="Reset Demo"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
