'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { searchCities } from '@/lib/cities';

export type CityResult = { name: string; state: string; lat: number; lng: number; display?: string; source?: 'local' | 'remote'; };

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSelect: (c: CityResult) => void;
  placeholder?: string;
  className?: string;
}

export default function CityInput({ value, onChange, onSelect, placeholder = 'Search city or town…', className = '' }: Props) {
  const [show, setShow]             = useState(false);
  const [locked, setLocked]         = useState(false);   // true once a suggestion is picked
  const [remoteResults, setRemote]  = useState<CityResult[]>([]);
  const [remoteLoading, setRLoading]= useState(false);
  const blurTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Instant local results
  const localResults = useMemo((): CityResult[] => {
    if (locked || !show) return [];
    return searchCities(value).map(c => ({ ...c, source: 'local' as const }));
  }, [value, show, locked]);

  // Debounced remote fetch — fires 400ms after typing stops, only if local has <3 results
  useEffect(() => {
    if (locked || !show || value.trim().length < 2) { setRemote([]); return; }
    if (remoteTimer.current) clearTimeout(remoteTimer.current);
    remoteTimer.current = setTimeout(async () => {
      setRLoading(true);
      try {
        const res: CityResult[] = await api.citySearchRemote(value);
        // Deduplicate against local — skip names already shown locally
        const localNames = new Set(localResults.map(c => c.name.toLowerCase()));
        setRemote(res.filter(r => !localNames.has(r.name.toLowerCase())).map(r => ({ ...r, source: 'remote' as const })));
      } catch { setRemote([]); }
      setRLoading(false);
    }, 400);
    return () => { if (remoteTimer.current) clearTimeout(remoteTimer.current); };
  }, [value, show, locked]);  // eslint-disable-line react-hooks/exhaustive-deps

  const allResults = [...localResults, ...remoteResults];

  function pick(c: CityResult) {
    onChange(c.name);
    setLocked(true);
    setShow(false);
    setRemote([]);
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onSelect(c);
  }

  function handleChange(v: string) {
    onChange(v);
    setLocked(false);
    setShow(true);
    setRemote([]);
  }

  const INPUT_BASE = `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${locked ? 'border-green-400 bg-green-50' : 'border-slate-200'} ${className}`;

  return (
    <div className="relative">
      <input
        value={value}
        className={INPUT_BASE}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => { setShow(true); if (blurTimer.current) clearTimeout(blurTimer.current); }}
        onBlur={() => { blurTimer.current = setTimeout(() => setShow(false), 200); }}
        onChange={e => handleChange(e.target.value)}
      />
      {/* Lock icon when selected */}
      {locked && (
        <span className="absolute right-2.5 top-2.5 text-green-500 text-sm">✓</span>
      )}
      {/* Loading spinner */}
      {remoteLoading && !locked && (
        <span className="absolute right-2.5 top-2.5 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      )}

      {/* Dropdown */}
      {show && !locked && (allResults.length > 0 || remoteLoading) && (
        <ul className="absolute z-50 left-0 right-0 bg-white border border-blue-200 rounded-xl shadow-2xl mt-1 max-h-64 overflow-y-auto">
          {/* Section header if mixing local + remote */}
          {localResults.length > 0 && remoteResults.length > 0 && (
            <li className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">Major Cities</li>
          )}
          {localResults.map(c => (
            <li key={`L-${c.name}-${c.state}`}
              className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between border-b border-slate-50 last:border-0"
              onMouseDown={e => { e.preventDefault(); pick(c); }}>
              <span className="text-sm font-semibold text-slate-800">{c.name}</span>
              <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-2 flex-shrink-0">{c.state}</span>
            </li>
          ))}
          {remoteResults.length > 0 && (
            <li className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider border-t border-slate-100">
              All India Locations
            </li>
          )}
          {remoteResults.map(c => (
            <li key={`R-${c.name}-${c.state}-${c.lat}`}
              className="px-3 py-2.5 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0"
              onMouseDown={e => { e.preventDefault(); pick(c); }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">{c.name}</span>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full ml-2 flex-shrink-0">{c.state}</span>
              </div>
              {c.display && (
                <div className="text-xs text-slate-400 truncate mt-0.5">{c.display}</div>
              )}
            </li>
          ))}
          {remoteLoading && remoteResults.length === 0 && localResults.length === 0 && (
            <li className="px-3 py-3 text-xs text-slate-400 flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              Searching all India locations…
            </li>
          )}
        </ul>
      )}

      {/* No results hint */}
      {show && !locked && !remoteLoading && allResults.length === 0 && value.trim().length >= 2 && (
        <div className="absolute z-50 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 px-3 py-2.5 text-xs text-slate-400">
          No results — try a different spelling or nearby landmark
        </div>
      )}
    </div>
  );
}
