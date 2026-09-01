import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SOCProvider, useSOC } from './components/common/SOCContext';
import { ThemeProvider } from './components/common/ThemeContext';
import { MainLayout } from './components/layout/MainLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { IncidentDetailPage } from './pages/IncidentDetailPage';
import { HumanApprovalPage } from './pages/HumanApprovalPage';
import { EvidenceAuditPage } from './pages/EvidenceAuditPage';
import { TrustRulesPage } from './pages/TrustRulesPage';
import { SettingsPage } from './pages/SettingsPage';
import { LiveThreatPage } from './pages/LiveThreatPage';

const ProtectedLayout: React.FC = () => {
  const { isAuthenticated, authLoading } = useSOC();
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-soc-bg text-soc-textSecondary text-sm">
        Connecting to Sentinel SOC…
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <MainLayout />;
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <SOCProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="live" element={<LiveThreatPage />} />
              <Route path="incidents" element={<IncidentsPage />} />
              <Route path="incident/:id" element={<IncidentDetailPage />} />
              <Route path="approvals" element={<HumanApprovalPage />} />
              <Route path="evidence" element={<EvidenceAuditPage />} />
              <Route path="rules" element={<TrustRulesPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SOCProvider>
    </ThemeProvider>
  );
};

export default App;

