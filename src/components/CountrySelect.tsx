import React, { useMemo } from 'react';
import { getSortedCountries } from '../data/countries';
import { useStore } from '../store/useStore';

interface CountrySelectProps {
  value: string; // ISO code (e.g., 'BJ')
  onChange: (isoCode: string) => void;
  className?: string;
  disabled?: boolean;
  short?: boolean;
  'aria-label'?: string;
}

export const CountrySelect: React.FC<CountrySelectProps> = ({
  value,
  onChange,
  className = '',
  disabled = false,
  short = false,
  'aria-label': ariaLabel
}) => {
  const language = useStore((s) => s.language);
  const sortedCountries = useMemo(() => getSortedCountries(language as any), [language]);

  return (
    <select
      value={value || 'BJ'}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className || "w-full bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 shadow-sm px-2.5 py-2.5"}
      style={short ? { width: '100%', minWidth: '95px', maxWidth: '115px' } : undefined}
      aria-label={ariaLabel || 'Sélectionner le pays'}
    >
      {sortedCountries.map((c) => (
        <option key={c.code} value={c.code} className="text-slate-900 bg-white">
          {short ? `${c.flag} ${c.code} (${c.dialCode})` : `${c.flag} ${language === 'en' ? c.name_en : c.name_fr} (${c.dialCode})`}
        </option>
      ))}
    </select>
  );
};
