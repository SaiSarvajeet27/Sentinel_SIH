import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { realtimeService, DemoStep } from '../../services/realtimeService';

export const MainLayout: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<DemoStep>(realtimeService.getCurrentStep());
  const [isDemoRunning, setIsDemoRunning] = useState<boolean>(realtimeService.getIsRunning());

  useEffect(() => {
    const unsubscribe = realtimeService.subscribe((step, running) => {
      setCurrentStep(step);
      setIsDemoRunning(running);
    });
    // The backend now generates incidents on its own, on a timer — this
    // just keeps the UI in sync with whatever it's doing, it doesn't
    // trigger anything. A page reload mid-cycle would otherwise show a
    // stale state until the next WS frame arrives.
    realtimeService.refreshFromBackend();
    return unsubscribe;
  }, []);

  return (
    <div className="flex h-screen bg-soc-bg text-soc-textPrimary overflow-hidden font-sans relative transition-colors">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar Header */}
        <Topbar currentDemoStep={currentStep} isDemoRunning={isDemoRunning} />

        {/* Page Content Scroll Area */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <Outlet context={{ currentStep, isDemoRunning }} />
        </main>
      </div>
    </div>
  );
};
