import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowRight, LayoutGrid, List } from 'lucide-react';
import { SearchBar } from '../components/common/SearchBar';
import { FilterBar } from '../components/common/FilterBar';
import { SeverityBadge } from '../components/common/SeverityBadge';
import { StatusBadge } from '../components/common/StatusBadge';
import { RiskScore } from '../components/common/RiskScore';
import { useSOC } from '../components/common/SOCContext';

export const IncidentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { incidents, setActiveIncidentId } = useSOC();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [filters, setFilters] = useState<Record<string, string>>({
    severity: 'ALL',
    status: 'ALL',
  });

  const filterGroups = [
    {
      id: 'severity',
      name: 'Severity',
      options: [
        { label: 'All Severities', value: 'ALL' },
        { label: 'Critical', value: 'CRITICAL' },
        { label: 'High', value: 'HIGH' },
        { label: 'Medium', value: 'MEDIUM' },
        { label: 'Low', value: 'LOW' },
      ],
    },
    {
      id: 'status',
      name: 'Status',
      options: [
        { label: 'All Statuses', value: 'ALL' },
        { label: 'Open', value: 'OPEN' },
        { label: 'Investigating', value: 'INVESTIGATING' },
        { label: 'Contained', value: 'CONTAINED' },
        { label: 'Resolved', value: 'RESOLVED' },
        { label: 'Closed', value: 'CLOSED' },
      ],
    },
  ];

  const handleFilterChange = (groupId: string, val: string) => {
    setFilters((prev) => ({ ...prev, [groupId]: val }));
  };

  const handleSelectIncident = (id: string) => {
    setActiveIncidentId(id);
    navigate(`/incident/${id}`);
  };

  const filteredIncidents = incidents.filter((inc) => {
    // Search matching
    const query = searchTerm.toLowerCase();
    const matchesSearch =
      !searchTerm ||
      inc.id.toLowerCase().includes(query) ||
      inc.title.toLowerCase().includes(query) ||
      inc.affectedUser.toLowerCase().includes(query) ||
      inc.affectedDevice.toLowerCase().includes(query) ||
      inc.attackVector.toLowerCase().includes(query);

    // Severity matching
    const matchesSeverity = filters.severity === 'ALL' || inc.severity === filters.severity;

    // Status matching
    const matchesStatus = filters.status === 'ALL' || inc.status === filters.status;

    return matchesSearch && matchesSeverity && matchesStatus;
  });

  return (
    <div className="space-y-5 font-sans transition-colors">
      {/* Title Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-soc-card border border-soc-border shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-soc-textPrimary tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-soc-accent" />
            INCIDENT MANAGEMENT CENTER
          </h1>
          <p className="text-xs text-soc-textSecondary mt-0.5">
            Real-time security threat triage, filtering, and cross-vector correlation
          </p>
        </div>

        <div className="flex items-center gap-1.5 bg-soc-secondaryCard p-1 rounded-lg border border-soc-border">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-soc-card text-soc-accent font-bold shadow-sm' : 'text-soc-textSecondary hover:text-soc-textPrimary'}`}
            title="Grid View"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded transition-colors ${viewMode === 'table' ? 'bg-soc-card text-soc-accent font-bold shadow-sm' : 'text-soc-textSecondary hover:text-soc-textPrimary'}`}
            title="Table View"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Search by Incident ID, Title, User, Device..." />
        <FilterBar
          groups={filterGroups}
          selectedFilters={filters}
          onFilterChange={handleFilterChange}
          onReset={() => {
            setSearchTerm('');
            setFilters({ severity: 'ALL', status: 'ALL' });
          }}
        />
      </div>

      {/* Content Rendering: Grid vs Table */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredIncidents.map((inc) => (
            <div
              key={inc.id}
              onClick={() => handleSelectIncident(inc.id)}
              className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer bg-soc-card hover:bg-soc-cardHover shadow-sm ${
                inc.severity === 'CRITICAL' ? 'border-red-500/40 hover:border-red-500' : 'border-soc-border hover:border-soc-borderLight'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <span className="text-xs font-bold font-mono text-soc-accent">{inc.id}</span>
                <div className="flex items-center gap-1.5">
                  <SeverityBadge severity={inc.severity} size="sm" />
                  <RiskScore score={inc.riskScore} size="sm" />
                </div>
              </div>

              <h3 className="text-xs font-bold text-soc-textPrimary leading-snug line-clamp-2 mb-1.5">{inc.title}</h3>
              <p className="text-[11px] text-soc-textSecondary line-clamp-2 mb-3">{inc.description}</p>

              <div className="space-y-1 pt-2.5 border-t border-soc-border text-[11px] font-mono text-soc-textSecondary">
                <div className="flex justify-between">
                  <span className="text-soc-textMuted">User:</span>
                  <span className="font-bold text-soc-textPrimary truncate max-w-[160px]">{inc.affectedUser}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-soc-textMuted">Device:</span>
                  <span className="font-bold text-soc-textPrimary">{inc.affectedDevice}</span>
                </div>
                <div className="flex justify-between items-center pt-0.5">
                  <span className="text-soc-textMuted">Status:</span>
                  <StatusBadge status={inc.status} size="sm" />
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-soc-border flex items-center justify-between text-[11px] font-mono text-soc-accent font-bold">
                <span>Investigate Case</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-soc-card border border-soc-border overflow-x-auto shadow-sm">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-soc-border text-soc-textMuted uppercase text-[10px] bg-soc-secondaryCard">
                <th className="p-2.5">Incident ID</th>
                <th className="p-2.5">Title</th>
                <th className="p-2.5">Severity</th>
                <th className="p-2.5">Risk Score</th>
                <th className="p-2.5">User</th>
                <th className="p-2.5">Device</th>
                <th className="p-2.5">Status</th>
                <th className="p-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-soc-border text-soc-textSecondary">
              {filteredIncidents.map((inc) => (
                <tr
                  key={inc.id}
                  onClick={() => handleSelectIncident(inc.id)}
                  className="hover:bg-soc-cardHover cursor-pointer transition-colors"
                >
                  <td className="p-2.5 font-bold text-soc-accent">{inc.id}</td>
                  <td className="p-2.5 font-bold text-soc-textPrimary">{inc.title}</td>
                  <td className="p-2.5"><SeverityBadge severity={inc.severity} size="sm" /></td>
                  <td className="p-2.5"><RiskScore score={inc.riskScore} size="sm" /></td>
                  <td className="p-2.5">{inc.affectedUser}</td>
                  <td className="p-2.5">{inc.affectedDevice}</td>
                  <td className="p-2.5"><StatusBadge status={inc.status} size="sm" /></td>
                  <td className="p-2.5 text-right text-soc-accent font-bold text-[11px]">Details →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
