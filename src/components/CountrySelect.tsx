import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import * as Flags from 'country-flag-icons/react/3x2';
import { ChevronDown, Search } from 'lucide-react';
import { getSortedCountries, Country } from '../data/countries';
import { useStore } from '../store/useStore';

interface CountrySelectProps {
  value: string; // ISO code (e.g., 'BJ')
  onChange: (isoCode: string) => void;
  className?: string;
  disabled?: boolean;
  short?: boolean;
  'aria-label'?: string;
}

/**
 * Rendu d'un drapeau SVG vectoriel local fiable et universel (y compris sous Windows)
 */
export const CountryFlag: React.FC<{ code: string; className?: string }> = ({
  code,
  className = 'w-5 h-3.5 object-cover rounded-sm shrink-0'
}) => {
  const upperCode = (code || 'BJ').toUpperCase();
  const FlagComponent = (Flags as any)[upperCode];

  if (FlagComponent) {
    return <FlagComponent className={className} aria-hidden="true" />;
  }

  return (
    <span
      className="inline-block w-5 h-3.5 bg-slate-200 dark:bg-slate-700 text-[8px] font-bold text-center leading-[14px] rounded-sm shrink-0 text-slate-700 dark:text-slate-300"
      aria-hidden="true"
    >
      {upperCode}
    </span>
  );
};

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

  const selectedCountry = useMemo(
    () => sortedCountries.find((c) => c.code.toUpperCase() === (value || 'BJ').toUpperCase()) || sortedCountries[0],
    [sortedCountries, value]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  // Filtrer les pays selon la recherche
  const filteredCountries = useMemo(() => {
    if (!search.trim()) return sortedCountries;
    const q = search.toLowerCase().trim();
    return sortedCountries.filter(
      (c) =>
        c.name_fr.toLowerCase().includes(q) ||
        c.name_en.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [sortedCountries, search]);

  // Clic extérieur pour fermer
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // Focus recherche lors de l'ouverture
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Scroll automatique pour l'élément surligné
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (code: string) => {
    onChange(code);
    setIsOpen(false);
    setSearch('');
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearch('');
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredCountries.length - 1 ? prev + 1 : 0));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredCountries.length - 1));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredCountries.length) {
        handleSelect(filteredCountries[highlightedIndex].code);
      }
      return;
    }

    if (e.key === 'Tab') {
      setIsOpen(false);
      setSearch('');
    }
  };

  const countryLabel = language === 'en' ? selectedCountry.name_en : selectedCountry.name_fr;
  const accessibleLabel = ariaLabel || `${countryLabel} (${selectedCountry.dialCode})`;

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${short ? 'w-full sm:w-[115px] shrink-0' : 'w-full'}`}
      onKeyDown={handleKeyDown}
    >
      {/* Bouton déclencheur / Combobox */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={accessibleLabel}
        className={
          className ||
          "w-full h-[52px] bg-slate-50 border border-slate-200 rounded-2xl px-3 py-3 text-xs font-bold text-slate-800 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all flex items-center justify-between gap-1.5 cursor-pointer disabled:opacity-50"
        }
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <CountryFlag code={selectedCountry.code} className="w-5 h-3.5 object-cover rounded-sm shadow-xs shrink-0" />
          <span className="truncate text-xs font-bold text-slate-800">
            {short ? selectedCountry.dialCode : `${countryLabel} (${selectedCountry.dialCode})`}
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Menu Déroulant / Listbox */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-64 max-w-[90vw] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Champ de recherche rapide */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlightedIndex(0);
                }}
                placeholder="Rechercher..."
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-white outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Liste des options */}
          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            aria-label="Liste des pays"
            className="max-h-56 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5"
          >
            {filteredCountries.length === 0 ? (
              <li className="px-3 py-3 text-xs font-medium text-slate-400 text-center">Aucun pays trouvé</li>
            ) : (
              filteredCountries.map((c, index) => {
                const isSelected = c.code.toUpperCase() === selectedCountry.code.toUpperCase();
                const isHighlighted = index === highlightedIndex;
                const name = language === 'en' ? c.name_en : c.name_fr;

                return (
                  <li
                    key={c.code}
                    id={`${listboxId}-opt-${c.code}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(c.code)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300 font-bold'
                        : isHighlighted
                        ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CountryFlag code={c.code} className="w-5 h-3.5 object-cover rounded-sm shadow-xs shrink-0" />
                      <span className="truncate">{name}</span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 shrink-0 ml-2">
                      {c.dialCode}
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
