import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { DemoControlBanner } from '../demo/DemoControlBanner';
import { realtimeService, DemoStep } from '../../services/realtimeService';

export const MainLayout: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<DemoStep>(realtimeService.getCurrentStep());
  const [isDemoRunning, setIsDemoRunning] = useState<boolean>(realtimeService.getIsRunning());

  useEffect(() => {
    const unsubscribe = realtimeService.subscribe((step, running) => {
      setCurrentStep(step);
      setIsDemoRunning(running);
    });
    // On mount, realtimeService starts from an idle placeholder and only
    // updates when a WS frame or a user action arrives — a page reload
    // mid-demo would otherwise show "Not started" until the next event.
    // Ask the backend what step it's actually on.
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

        {/* Demo Mode Control Banner */}
        <DemoControlBanner currentStep={currentStep} isRunning={isDemoRunning} />

        {/* Page Content Scroll Area */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <Outlet context={{ currentStep, isDemoRunning }} />
        </main>
      </div>
    </div>
  );
};
