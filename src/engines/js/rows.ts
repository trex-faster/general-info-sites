import type { Column } from '@/core/types';
import type { Cell, Row } from '../types';
import { queryPath } from './path';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function flatten(v: unknown, prefix = '', depth = 0, out: Row = {}): Row {
  if (isObj(v) && depth < 4) {
    for (const [k, x] of Object.entries(v)) flatten(x, prefix ? `${prefix}.${k}` : k, depth + 1, out);
  } else if (Array.isArray(v)) {
    out[prefix] = v.every((x) => x == null || typeof x !== 'object') ? v.join(' | ') : JSON.stringify(v);
  } else if (v == null) out[prefix] = '';
  else if (typeof v === 'object') out[prefix] = JSON.stringify(v);
  else out[prefix || 'value'] = v as Cell;
  return out;
}

export function suggestColumns(items: unknown[], max = 40): Column[] {
  const freq = new Map<string, number>();
  for (const it of items.slice(0, 25)) for (const k of Object.keys(flatten(it))) freq.set(k, (freq.get(k) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([k]) => ({ name: k, key: k }));
}

export function buildRows(items: unknown[], columns: Column[]): Row[] {
  return items.map((it) => {
    const flat = flatten(it);
    const row: Row = {};
    for (const c of columns) {
      if (c.key in flat) row[c.name] = flat[c.key] ?? '';
      else {
        const r = queryPath(it, c.key);
        const x = r.length <= 1 ? r[0] : r;
        row[c.name] = x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : (x as Cell);
      }
    }
    return row;
  });
}

const csvCell = (v: Cell | undefined) => {
  let s = v == null ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // evita inyección de fórmulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCSV(rows: Row[], columns?: string[]): string {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return '\ufeff' + [cols.map(csvCell).join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n');
}

