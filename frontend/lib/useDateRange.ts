import { useState, useMemo } from 'react';

export type Preset = '1m' | '3m' | '6m' | 'custom';

export const TODAY_YM = '2026-05'; // last month with full data in mock dataset

export function subtractMonths(baseYM: string, n: number): string {
  const [y, m] = baseYM.split('-').map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function fmtYM(ym: string): string {
  const [y, m] = ym.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(m) - 1]} ${y}`;
}

export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${ym}-${String(lastDay).padStart(2, '0')}`;
}

export function useDateRange() {
  const [preset, setPreset]   = useState<Preset>('6m');
  const [fromYM, setFromYM]   = useState('2025-12');
  const [toYM, setToYM]       = useState('2026-05');

  const effectiveFrom = useMemo(() =>
    preset === 'custom' ? fromYM
      : subtractMonths(TODAY_YM, preset === '1m' ? 0 : preset === '3m' ? 2 : 5),
    [preset, fromYM]);

  const effectiveTo = useMemo(() =>
    preset === 'custom' ? toYM : TODAY_YM,
    [preset, toYM]);

  function inRange(dateStr: string | null | undefined): boolean {
    if (!dateStr) return false;
    const ym = dateStr.slice(0, 7);
    return ym >= effectiveFrom && ym <= effectiveTo;
  }

  return { preset, setPreset, fromYM, setFromYM, toYM, setToYM, effectiveFrom, effectiveTo, inRange };
}
