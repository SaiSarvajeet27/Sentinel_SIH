import React from 'react';
import { Filter } from 'lucide-react';

interface FilterOption {
  label: string;
  value: string;
}

interface FilterGroup {
  id: string;
  name: string;
  options: FilterOption[];
}

interface Props {
  groups: FilterGroup[];
  selectedFilters: Record<string, string>;
  onFilterChange: (groupId: string, value: string) => void;
  onReset?: () => void;
}

export const FilterBar: React.FC<Props> = ({ groups, selectedFilters, onFilterChange, onReset }) => {
  return (
    <div className="flex flex-wrap items-center gap-3 bg-soc-card p-3 rounded-xl border border-soc-border shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-soc-textSecondary uppercase tracking-wider font-mono">
        <Filter className="w-4 h-4 text-soc-accent" />
        <span>Filters:</span>
      </div>

      {groups.map((group) => (
        <div key={group.id} className="flex items-center gap-1">
          <label className="text-xs text-soc-textSecondary font-mono hidden sm:inline">{group.name}:</label>
          <select
            value={selectedFilters[group.id] || 'ALL'}
            onChange={(e) => onFilterChange(group.id, e.target.value)}
            className="bg-soc-secondaryCard border border-soc-border text-soc-textPrimary text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:border-soc-accent font-mono"
          >
            {group.options.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-soc-card text-soc-textPrimary">
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {onReset && (
        <button
          onClick={onReset}
          className="ml-auto text-xs text-soc-textSecondary hover:text-soc-accent font-mono underline underline-offset-2 transition-colors"
        >
          Reset All
        </button>
      )}
    </div>
  );
};
