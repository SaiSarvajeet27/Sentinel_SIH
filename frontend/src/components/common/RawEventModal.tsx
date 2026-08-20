import React from 'react';
import { X, FileCode, Shield, Clock, HardDrive, User, Network, Mail } from 'lucide-react';
import { SecurityEvent } from '../../types/soc';
import { SeverityBadge } from './SeverityBadge';

interface Props {
  isOpen: boolean;
  event: SecurityEvent | null;
  onClose: () => void;
}

export const RawEventModal: React.FC<Props> = ({ isOpen, event, onClose }) => {
  if (!isOpen || !event) return null;

  const getSourceIcon = () => {
    switch (event.source) {
      case 'EMAIL':
        return Mail;
      case 'IDENTITY':
        return User;
      case 'ENDPOINT':
        return HardDrive;
      case 'NETWORK':
        return Network;
      default:
        return Shield;
    }
  };

  const SourceIcon = getSourceIcon();

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-soc-card border border-soc-border rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl animate-fade-in font-sans">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-soc-card via-soc-cardHover to-soc-accent/10 border-b border-soc-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-950 border border-cyan-300 dark:border-cyan-700 text-cyan-800 dark:text-cyan-400">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-soc-textPrimary font-mono">{event.id}</span>
                <SeverityBadge severity={event.severity} size="sm" />
              </div>
              <p className="text-xs text-soc-textMuted">Raw Telemetry Payload & Context Inspection</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-soc-textMuted hover:text-soc-textPrimary hover:bg-soc-cardHover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-soc-secondaryCard border border-soc-border space-y-0.5">
              <span className="text-[9px] text-soc-textMuted font-bold uppercase block">Source Layer:</span>
              <div className="font-bold text-soc-cyan flex items-center gap-1">
                <SourceIcon className="w-3.5 h-3.5" />
                <span>{event.source}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-soc-secondaryCard border border-soc-border space-y-0.5">
              <span className="text-[9px] text-soc-textMuted font-bold uppercase block">Event Type:</span>
              <div className="font-bold text-soc-textPrimary truncate">{event.eventType}</div>
            </div>

            <div className="p-3 rounded-xl bg-soc-secondaryCard border border-soc-border space-y-0.5">
              <span className="text-[9px] text-soc-textMuted font-bold uppercase block">User Principal:</span>
              <div className="font-bold text-amber-700 dark:text-amber-300 truncate">{event.user}</div>
            </div>

            <div className="p-3 rounded-xl bg-soc-secondaryCard border border-soc-border space-y-0.5">
              <span className="text-[9px] text-soc-textMuted font-bold uppercase block">Target Device / IP:</span>
              <div className="font-bold text-purple-700 dark:text-purple-300 truncate">{event.device}</div>
            </div>
          </div>

          {/* Event Description */}
          <div className="p-3 rounded-xl bg-soc-secondaryCard border border-soc-border space-y-1">
            <span className="text-[10px] font-bold text-soc-textMuted uppercase block">Event Description:</span>
            <p className="text-soc-textSecondary font-sans">{event.description}</p>
          </div>

          {/* Details Table */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-soc-textMuted uppercase tracking-wider block">
              Structured Event Details:
            </span>
            <div className="bg-soc-secondaryCard rounded-xl border border-soc-border overflow-hidden p-3 font-mono text-[11px] space-y-1 text-soc-textSecondary">
              {Object.entries(event.details || {}).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between border-b border-soc-border/40 pb-1">
                  <span className="text-soc-textMuted">{key}:</span>
                  <span className="text-soc-cyan font-bold">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Raw JSON Payload */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-soc-textMuted uppercase tracking-wider block">
              Raw JSON Log Payload:
            </span>
            <pre className="p-3 rounded-xl soc-code-block text-[10px] font-mono overflow-x-auto max-h-40">
              {event.rawPayload || JSON.stringify(event, null, 2)}
            </pre>
          </div>

          <div className="flex items-center justify-between text-soc-textMuted text-[10px] pt-1">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Timestamp: {event.timestamp}</span>
            </div>
            <span>Incident Context: {event.incidentId || 'Unlinked'}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-soc-secondaryCard border-t border-soc-border flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-soc-card border border-soc-border hover:bg-soc-cardHover text-soc-textPrimary font-bold transition-colors cursor-pointer"
          >
            CLOSE EVENT
          </button>
        </div>
      </div>
    </div>
  );
};
