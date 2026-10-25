import type { Entity, FieldSpec, ListResult, SiteRule, StrategyId, StrategyResult } from './types';
import type { Row } from '@/engines/types';
import { abs, getPath, parsePrice, text } from './util';

/** Orden por defecto: de lo más fiable a lo menos fiable. */
export const DEFAULT_ORDER: StrategyId[] = ['rule', 'jsonld', 'microdata', 'opengraph', 'embedded', 'repeats', 'heuristics', 'ai'];

export function hostMatches(pattern: string, host: string): boolean {
  const p = pattern.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');
  const h = host.toLowerCase().replace(/^www\./, '');
  return h === p || h.endsWith('.' + p);
}

/** Primera regla cuyo host (y ruta, si la tiene) coincide. Las del usuario van primero y mandan sobre las incluidas. */
export function matchRule(rules: SiteRule[], url: string): SiteRule | undefined {
  let u: URL;
  try { u = new URL(url); } catch { return undefined; }
  return rules.find((r) => {
    const hosts = Array.isArray(r.match.host) ? r.match.host : [r.match.host];
    if (!hosts.some((h) => hostMatches(h, u.hostname))) return false;
    if (!r.match.path) return true;
    try { return new RegExp(r.match.path).test(u.pathname + u.search); } catch { return false; }
  });
}

export function orderFor(rule?: SiteRule): StrategyId[] {
  const base = rule?.prefer?.length ? [...new Set([...rule.prefer, ...DEFAULT_ORDER])] : [...DEFAULT_ORDER];
  const off = new Set(rule?.disable ?? []);
  return base.filter((s) => !off.has(s));
}

/** Validación mínima para reglas importadas a mano. Devuelve los problemas encontrados. */
export function validateRule(r: unknown): string[] {
  const errs: string[] = [];
  const o = r as Partial<SiteRule> | null;
  if (!o || typeof o !== 'object') return ['La regla no es un objeto'];
  if (!o.id || typeof o.id !== 'string') errs.push('Falta "id"');
  if (!o.match?.host || (typeof o.match.host !== 'string' && !Array.isArray(o.match.host))) errs.push('Falta "match.host"');
  if (o.match?.path) { try { new RegExp(o.match.path); } catch { errs.push('"match.path" no es una expresión regular válida'); } }
  if (o.list && (!o.list.rowSelector || !Array.isArray(o.list.columns))) errs.push('"list" necesita rowSelector y columns');
  if (o.entity && (!o.entity.type || typeof o.entity.fields !== 'object')) errs.push('"entity" necesita type y fields');
  if (o.status && !['experimental', 'stable', 'unsupported'].includes(o.status)) errs.push('"status" inválido');
  return errs;
}

function transform(v: unknown, t: FieldSpec['transform'], url: string): unknown {
  if (v == null) return v;
  if (Array.isArray(v)) return v.map((x) => transform(x, t, url));
  if (t === 'number') return parsePrice(String(v)) ?? null;
  if (t === 'trim') return String(v).trim();
  if (t === 'url') return abs(String(v), url);
  return v;
}

function readField(f: FieldSpec, doc: Document, url: string, structured: Entity[], meta: Record<string, string>): unknown {
  let v: unknown;
  if (f.css) {
    const read = (el: Element) => (f.attr ? el.getAttribute(f.attr) ?? '' : text(el));
    try {
      v = f.all ? [...doc.querySelectorAll(f.css)].map(read) : (() => { const el = doc.querySelector(f.css!); return el ? read(el) : undefined; })();
    } catch { v = undefined; }
  }
  if ((v == null || v === '') && f.jsonld) {
    for (const e of structured) { const x = getPath(e.data, f.jsonld); if (x != null && x !== '') { v = x; break; } }
  }
  if ((v == null || v === '') && f.meta) v = meta[f.meta];
  if (typeof v === 'string' && f.regex) {
    try { const m = v.match(new RegExp(f.regex)); v = m ? (m[1] ?? m[0]) : undefined; } catch { /* regex inválida: ignora */ }
  }
  return transform(v, f.transform, url);
}

/** Aplica una regla declarativa. No ejecuta código del sitio ni del archivo de reglas: solo selectores y rutas. */
export function applyRule(rule: SiteRule, doc: Document, url: string, structured: Entity[], meta: Record<string, string>): StrategyResult {
  const res: StrategyResult = { strategy: 'rule', entities: [], lists: [] };
  if (rule.status === 'unsupported') return res;
  try {
    if (rule.entity) {
      const data: Record<string, unknown> = {};
      for (const [k, f] of Object.entries(rule.entity.fields)) {
        const v = readField(f, doc, url, structured, meta);
        if (v != null && v !== '') data[k] = v;
      }
      if (Object.keys(data).length) res.entities.push({ type: rule.entity.type, source: 'rule', data });
    }
    if (rule.list) {
      const rows: Row[] = [...doc.querySelectorAll(rule.list.rowSelector)].slice(0, 2000).map((el) => {
        const row: Row = {};
        for (const c of rule.list!.columns) {
          let t: Element | null = el;
          if (c.selector) { try { t = el.querySelector(c.selector); } catch { t = null; } }
          const raw = t && c.attr ? t.getAttribute(c.attr) ?? '' : '';
          row[c.name] = !t ? '' : c.attr ? (/^(href|src)$/.test(c.attr) ? abs(raw, url) : raw) : text(t);
        }
        return row;
      });
      if (rows.length) res.lists.push({ source: 'rule', name: `${rule.name} (regla)`, rows, spec: rule.list, score: 1 } satisfies ListResult);
    }
  } catch (e) { res.error = String(e); }
  return res;
}
