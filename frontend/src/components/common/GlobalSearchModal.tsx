import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShieldAlert, History, Monitor, X, ArrowRight } from 'lucide-react';
import { useSOC } from './SOCContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { incidents, events, evidence } = useSOC();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const q = query.toLowerCase().trim();

  const matchingIncidents = q
    ? incidents.filter(
        (i) =>
          i.id.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          i.affectedUser.toLowerCase().includes(q) ||
          i.affectedDevice.toLowerCase().includes(q)
      )
    : incidents.slice(0, 3);

  const matchingEvents = q
    ? events.filter(
        (e) =>
          e.id.toLowerCase().includes(q) ||
          e.eventType.toLowerCase().includes(q) ||
          e.user.toLowerCase().includes(q) ||
          e.device.toLowerCase().includes(q) ||
          e.ip.toLowerCase().includes(q)
      )
    : events.slice(0, 3);

  const matchingEvidence = q
    ? evidence.filter(
        (e) =>
          e.id.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q)
      )
    : evidence.slice(0, 2);

  const handleSelectIncident = (id: string) => {
    navigate(`/incident/${id}`);
    onClose();
  };

  const handleSelectEvent = () => {
    navigate('/evidence');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-2xl bg-soc-card border border-soc-border rounded-xl shadow-2xl overflow-hidden font-sans text-xs flex flex-col">
        {/* Search Bar Input */}
        <div className="p-3.5 border-b border-soc-border flex items-center gap-3 bg-soc-secondaryCard">
          <Search className="w-4 h-4 text-soc-accent shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SOC records (e.g. INC-1042, student01, LAB-PC-07, EVT-801)..."
            className="flex-1 bg-transparent text-soc-textPrimary font-mono text-xs outline-none placeholder:text-soc-textMuted"
          />
          <span className="px-1.5 py-0.5 rounded bg-soc-secondaryCard border border-soc-border text-soc-textMuted text-[10px] uppercase font-bold">ESC</span>
          <button onClick={onClose} className="p-1 rounded text-soc-textMuted hover:text-soc-textPrimary">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
          {/* Incidents Section */}
          {matchingIncidents.length > 0 && (
            <div>
              <div className="text-[10px] text-soc-textMuted font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-soc-cyan" />
                <span>Incidents ({matchingIncidents.length})</span>
              </div>
              <div className="space-y-1.5">
                {matchingIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => handleSelectIncident(inc.id)}
                    className="p-2.5 rounded-lg bg-soc-secondaryCard hover:bg-soc-cardHover border border-soc-border cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-soc-cyan">{inc.id}</span>
                      <span className="text-soc-textPrimary font-bold truncate max-w-xs">{inc.title}</span>
                      <span className="text-soc-textMuted text-[11px] truncate">({inc.affectedUser} / {inc.affectedDevice})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-soc-accent font-bold flex items-center gap-1 text-[11px]">
                        <span>Open</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Events Section */}
          {matchingEvents.length > 0 && (
            <div>
              <div className="text-[10px] text-soc-textMuted font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-soc-ai" />
                <span>Security Events ({matchingEvents.length})</span>
              </div>
              <div className="space-y-1.5">
                {matchingEvents.map((evt) => (
                  <div
                    key={evt.id}
                    onClick={handleSelectEvent}
                    className="p-2.5 rounded-lg bg-soc-secondaryCard hover:bg-soc-cardHover border border-soc-border cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="font-bold text-soc-ai">{evt.id}</span>
                      <span className="text-soc-textPrimary font-bold">{evt.eventType}</span>
                      <span className="text-soc-textMuted truncate text-[11px]">[{evt.source}] {evt.user} @ {evt.device}</span>
                    </div>
                    <span className="text-soc-textMuted text-[10px] shrink-0 font-mono">{evt.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidence Section */}
          {matchingEvidence.length > 0 && (
            <div>
              <div className="text-[10px] text-soc-textMuted font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-emerald-500" />
                <span>Evidence Artifacts ({matchingEvidence.length})</span>
              </div>
              <div className="space-y-1.5">
                {matchingEvidence.map((evd) => (
                  <div
                    key={evd.id}
                    onClick={handleSelectEvent}
                    className="p-2.5 rounded-lg bg-soc-secondaryCard hover:bg-soc-cardHover border border-soc-border cursor-pointer flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{evd.id}</span>
                      <span className="text-soc-textPrimary font-bold">{evd.name}</span>
                      <span className="text-soc-textMuted text-[11px]">({evd.type})</span>
                    </div>
                    <span className="text-soc-textMuted text-[10px] shrink-0">SHA-256 Verified</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {matchingIncidents.length === 0 && matchingEvents.length === 0 && matchingEvidence.length === 0 && (
            <div className="p-8 text-center text-soc-textMuted font-mono">
              No matching SOC records found for "{query}".
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-soc-border bg-soc-secondaryCard flex items-center justify-between text-[11px] text-soc-textMuted">
          <span>Search spans Incidents, Events, Evidence Payloads & Telemetry</span>
          <span>Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-soc-card border border-soc-border text-soc-textPrimary">Ctrl+K</kbd> anywhere</span>
        </div>
      </div>
    </div>
  );
};
