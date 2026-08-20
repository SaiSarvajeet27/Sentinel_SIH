import React from 'react';
import { Search, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export const SearchBar: React.FC<Props> = ({ value, onChange, placeholder = 'Search incidents, events, IPs, users...' }) => {
  return (
    <div className="relative flex-1 min-w-[240px]">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-soc-textSecondary">
        <Search className="w-4 h-4" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 text-xs bg-soc-card border border-soc-border rounded-lg text-soc-textPrimary placeholder:text-soc-textMuted focus:outline-none focus:border-soc-accent focus:ring-1 focus:ring-soc-accent transition-colors font-sans shadow-sm"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-soc-textSecondary hover:text-soc-textPrimary"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
