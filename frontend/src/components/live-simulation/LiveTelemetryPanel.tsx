import React, { useState } from 'react';
import {
  Radio,
  Mail,
  Laptop,
  User,
  Globe,
  Code,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { LiveTelemetryEvent } from '../../types/liveSimulation';

interface Props {
  event: LiveTelemetryEvent | null;
  processedTelemetry: {
    normalized: boolean;
    correlatedSources: string[];
    riskIndicatorsFound: number;
  } | null;
  isProcessing?: boolean;
}

export const LiveTelemetryPanel: React.FC<Props> = ({
  event,
  processedTelemetry,
  isProcessing = false,
}) => {
  const [showRawJson, setShowRawJson] = useState(false);

  if (!event) {
    return (
      <div className="bg-soc-card border border-soc-border rounded-xl p-5 shadow-sm space-y-3 flex flex-col items-center justify-center min-h-[220px] text-center">
        <div className="p-3 rounded-full bg-soc-secondaryCard text-soc-textMuted border border-soc-border">
          <Radio className="w-5 h-5 animate-pulse" />
        </div>
        <div className="space-y-1">
          <div className="text-xs font-bold text-soc-textPrimary">Waiting for Ingested Telemetry</div>
          <p className="text-[11px] text-soc-textSecondary max-w-sm">
            Click <span className="font-semibold text-soc-accent">Start Live Threat Simulation</span> to ingest synthetic email gateway and authentication telemetry.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-soc-card border border-soc-border rounded-xl p-4 shadow-sm space-y-3.5">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-soc-border pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-red-500/15 text-red-500">
            <Mail className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-soc-textPrimary">{event.id}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-500 border border-red-500/30">
                {event.severity}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-soc-textSecondary bg-soc-secondaryCard border border-soc-border">
                {event.source}
              </span>
            </div>
            <div className="text-[10px] text-soc-textSecondary font-medium mt-0.5">
              {event.eventType}
            </div>
          </div>
        </div>

        <span className="text-[10px] font-mono text-soc-textMuted">
          {new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false })}
        </span>
      </div>

      {/* Primary Telemetry Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-0.5">
          <div className="flex items-center gap-1.5 text-soc-textMuted text-[10px] font-semibold">
            <User className="w-3 h-3" />
            <span>Target User</span>
          </div>
          <div className="font-bold text-soc-textPrimary truncate">{event.user}</div>
        </div>

        <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-0.5">
          <div className="flex items-center gap-1.5 text-soc-textMuted text-[10px] font-semibold">
            <Laptop className="w-3 h-3" />
            <span>Host Device</span>
          </div>
          <div className="font-bold text-soc-textPrimary truncate">{event.host}</div>
        </div>

        <div className="p-2.5 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-0.5">
          <div className="flex items-center gap-1.5 text-soc-textMuted text-[10px] font-semibold">
            <Globe className="w-3 h-3" />
            <span>External IP / ASN</span>
          </div>
          <div className="font-mono font-bold text-soc-textPrimary truncate">{event.ip}</div>
        </div>
      </div>

      {/* Summary Narrative */}
      <div className="p-2.5 rounded-lg bg-soc-secondaryCard/80 border border-soc-border text-xs text-soc-textSecondary leading-relaxed">
        <span className="font-semibold text-soc-textPrimary mr-1">Telemetry Summary:</span>
        {event.summary}
      </div>

      {/* Multi-Source Normalization / Correlation Sub-stage (Stage 2) */}
      <div className="p-3 rounded-lg bg-soc-secondaryCard border border-soc-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-soc-textPrimary">
            <Layers className="w-3.5 h-3.5 text-soc-accent" />
            <span>Telemetry Normalization & Multi-Source Correlation</span>
          </div>
          {processedTelemetry ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              Correlated (3 Feeds)
            </span>
          ) : isProcessing ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-blue-500 animate-pulse">
              <Radio className="w-3 h-3 animate-spin" />
              Correlating Signals…
            </span>
          ) : (
            <span className="text-[10px] text-soc-textMuted">Pending correlation</span>
          )}
        </div>

        {processedTelemetry && (
          <div className="space-y-1.5 text-[11px]">
            <div className="flex flex-wrap gap-1.5">
              {processedTelemetry.correlatedSources.map((source, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded bg-soc-card border border-soc-border font-medium text-soc-textSecondary"
                >
                  ✓ {source}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between text-[10px] text-soc-textMuted pt-1 border-t border-soc-border/50">
              <span>Risk Indicators Extracted: <strong className="text-soc-textPrimary">{processedTelemetry.riskIndicatorsFound} High-Fidelity Signals</strong></span>
              <span className="text-emerald-500 font-semibold">Schema: OCSF / ECS Normalized</span>
            </div>
          </div>
        )}
      </div>

      {/* Raw Payload Accordion */}
      <div>
        <button
          onClick={() => setShowRawJson(!showRawJson)}
          className="flex items-center justify-between w-full p-2 rounded-lg bg-soc-secondaryCard border border-soc-border hover:bg-soc-cardHover transition-colors text-xs font-semibold text-soc-textSecondary"
        >
          <div className="flex items-center gap-1.5">
            <Code className="w-3.5 h-3.5 text-soc-textMuted" />
            <span>Raw Ingested JSON Telemetry Payload</span>
          </div>
          {showRawJson ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {showRawJson && (
          <div className="mt-2 p-2.5 rounded-lg bg-slate-950 text-slate-200 border border-slate-800 text-[10px] font-mono overflow-x-auto max-h-44">
            <pre>{JSON.stringify(event.rawPayload, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
};
