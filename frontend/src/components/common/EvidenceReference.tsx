import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { useSOC } from './SOCContext';
import { RawEventModal } from './RawEventModal';
import { SecurityEvent } from '../../types/soc';
import { backendApi } from '../../services/backendApi';
import { adaptEvent } from '../../services/adapters';

interface Props {
  eventId: string;
  size?: 'sm' | 'md';
}

export const EvidenceReference: React.FC<Props> = ({ eventId, size = 'md' }) => {
  const { events } = useSOC();
  const [isOpen, setIsOpen] = useState(false);
  const [fetchedEvent, setFetchedEvent] = useState<SecurityEvent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const cachedEvent = events.find((e) => e.id === eventId);

  const handleOpen = async () => {
    setIsOpen(true);
    if (cachedEvent || fetchedEvent || notFound) return;
    setIsLoading(true);
    try {
      const raw = await backendApi.getEvent(eventId);
      setFetchedEvent(adaptEvent(raw));
    } catch {
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  };

  const matchedEvent = cachedEvent || fetchedEvent;

  return (
    <>
      <button
        onClick={handleOpen}
        title={`Click to view raw telemetry event ${eventId}`}
        className={`inline-flex items-center gap-1 rounded bg-cyan-100 hover:bg-cyan-200 border border-cyan-300 text-cyan-800 dark:bg-cyan-950/80 dark:hover:bg-cyan-900 dark:border-cyan-700 dark:text-cyan-300 font-mono font-bold transition-all shadow-sm dark:shadow-glow-cyan cursor-pointer ${
          size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
        }`}
      >
        <FileText className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        <span>[{eventId}]</span>
      </button>

      {matchedEvent ? (
        <RawEventModal isOpen={isOpen} event={matchedEvent} onClose={() => setIsOpen(false)} />
      ) : (
        isOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsOpen(false)}>
            <div className="bg-soc-card border border-soc-border rounded-2xl max-w-sm w-full p-6 text-center text-xs" onClick={(e) => e.stopPropagation()}>
              <p className="text-soc-textPrimary font-mono">
                {isLoading ? `Loading event ${eventId}...` : `Event ${eventId} not found on the server.`}
              </p>
              <button
                onClick={() => setIsOpen(false)}
                className="mt-4 px-4 py-2 rounded-lg bg-soc-secondaryCard border border-soc-border text-soc-textSecondary hover:text-soc-textPrimary font-bold cursor-pointer"
              >
                CLOSE
              </button>
            </div>
          </div>
        )
      )}
    </>
  );
};
