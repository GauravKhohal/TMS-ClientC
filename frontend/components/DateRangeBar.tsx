'use client';
import { type Preset, TODAY_YM, fmtYM, lastDayOfMonth } from '@/lib/useDateRange';

interface Props {
  preset: Preset;
  setPreset: (p: Preset) => void;
  fromYM: string;
  setFromYM: (v: string) => void;
  toYM: string;
  setToYM: (v: string) => void;
  effectiveFrom: string;
  effectiveTo: string;
  count?: number;       // optional: "showing N records"
  total?: number;       // optional: "of N total"
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: '1m', label: 'Last 1 Month' },
  { key: '3m', label: 'Last 3 Months' },
  { key: '6m', label: 'Last 6 Months' },
  { key: 'custom', label: 'Custom Range' },
];

export function DateRangeBar({
  preset, setPreset, fromYM, setFromYM, toYM, setToYM,
  effectiveFrom, effectiveTo, count, total,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3 flex-wrap">
      <span className="text-xs font-semibold text-slate-500 flex-shrink-0">Period</span>

      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              preset === p.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">From</span>
          <input type="date" value={`${fromYM}-01`} max={`${toYM}-01`}
            onChange={e => setFromYM(e.target.value.slice(0, 7))}
            className="px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
          <span className="text-xs text-slate-400">to</span>
          <input type="date" value={lastDayOfMonth(toYM)} min={`${fromYM}-01`} max={lastDayOfMonth(TODAY_YM)}
            onChange={e => setToYM(e.target.value.slice(0, 7))}
            className="px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" />
        </div>
      )}

      <div className="ml-auto flex items-center gap-3 flex-shrink-0">
        {count !== undefined && total !== undefined && (
          <span className="text-xs text-slate-400">
            <span className="font-medium text-slate-600">{count}</span> of {total} records
          </span>
        )}
        <div className="flex items-center gap-1.5 text-xs">
          <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="font-medium text-slate-700">{fmtYM(effectiveFrom)}</span>
          <span className="text-slate-400">–</span>
          <span className="font-medium text-slate-700">{fmtYM(effectiveTo)}</span>
        </div>
      </div>
    </div>
  );
}
