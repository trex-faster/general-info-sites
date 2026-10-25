import type { Row } from '@/engines/types';
import { flatten } from '@/engines/js';
import type { Entity, PageAnalysis, SiteRule, StrategyId, StrategyResult } from './types';
import { extractJsonLd } from './jsonld';
import { extractMicrodata } from './microdata';
import { extractOpenGraph, readFeeds, readMeta } from './opengraph';
import { extractRepeats, LIST_MIN_SCORE } from './repeats';
import { extractHeuristics } from './heuristics';
import { applyRule, matchRule, orderFor } from './rules';

const safe = (strategy: StrategyId, fn: () => Partial<StrategyResult>): StrategyResult => {
  try { return { strategy, entities: [], lists: [], ...fn() }; }
  catch (e) { return { strategy, entities: [], lists: [], error: String(e) }; }
};

/**
 * Corre todos los métodos que solo necesitan el DOM de la página (se ejecuta en el content script).
 * No decide cuál usar: eso lo hace `cascade`, para poder mostrar también lo que dieron los demás.
 */
export function analyzeDom(doc: Document, url: string, rules: SiteRule[] = []): PageAnalysis {
  const rule = matchRule(rules, url);
  const off = new Set(rule?.disable ?? []);
  const meta = readMeta(doc, url);
  const results: StrategyResult[] = [];

  const jsonld = safe('jsonld', () => ({ entities: extractJsonLd(doc) }));
  const micro = safe('microdata', () => ({ entities: extractMicrodata(doc, url) }));
  const og = safe('opengraph', () => ({ entities: extractOpenGraph(meta) }));
  const repeats = safe('repeats', () => ({ lists: extractRepeats(doc, url) }));
  const heur = safe('heuristics', () => ({ entities: extractHeuristics(doc, url, meta) }));
  if (rule && rule.status !== 'unsupported') results.push(safe('rule', () => applyRule(rule, doc, url, [...jsonld.entities, ...micro.entities], meta)));
  for (const r of [jsonld, micro, og, repeats, heur]) if (!off.has(r.strategy)) results.push(r);

  return { url, meta, feeds: readFeeds(doc, url), results, ruleNote: rule?.note, ruleStatus: rule?.status };
}

/** ¿Este resultado aporta datos reales (no solo contexto ni listas dudosas)? */
export function useful(r: StrategyResult): boolean {
  return r.entities.some((e) => !e.noise) || r.lists.some((l) => l.score >= LIST_MIN_SCORE && l.rows.length > 0);
}

export interface Cascade {
  /** Primer método (según el orden) que devolvió datos útiles. */
  winner?: StrategyResult;
  /** Todos los métodos, en orden, con su resumen. */
  tried: { strategy: StrategyId; entities: number; lists: number; useful: boolean; error?: string }[];
  order: StrategyId[];
}

/** La cascada: recorre los métodos en orden y se queda con el primero que dé datos útiles. */
export function cascade(a: PageAnalysis, extra: StrategyResult[] = [], rule?: SiteRule): Cascade {
  const order = orderFor(rule);
  const byId = new Map<StrategyId, StrategyResult>();
  for (const r of [...a.results, ...extra]) byId.set(r.strategy, r);
  const tried: Cascade['tried'] = [];
  let winner: StrategyResult | undefined;
  for (const id of order) {
    const r = byId.get(id);
    if (!r) continue;
    const ok = useful(r);
    tried.push({ strategy: id, entities: r.entities.filter((e) => !e.noise).length, lists: r.lists.length, useful: ok, error: r.error });
    if (ok && !winner) winner = r;
  }
  return { winner, tried, order };
}

export interface Table { name: string; rows: Row[] }

/** Convierte un resultado en tablas planas listas para CSV/JSON (una por tipo de entidad y una por lista). */
export function toTables(r: StrategyResult, includeNoise = false): Table[] {
  const out: Table[] = [];
  const byType = new Map<string, Entity[]>();
  for (const e of r.entities) {
    if (e.noise && !includeNoise) continue;
    byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
  }
  for (const [type, list] of byType) out.push({ name: type, rows: list.map((e) => flatten(e.data)) });
  for (const l of r.lists) if (l.score >= LIST_MIN_SCORE || r.strategy === 'rule' || includeNoise) out.push({ name: l.name, rows: l.rows });
  return out;
}
