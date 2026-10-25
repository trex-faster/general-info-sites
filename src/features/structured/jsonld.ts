import type { Entity } from './types';
import { isObj, shortType } from './util';

/** Tipos de contexto: útiles para describir la página pero no son "los datos" que se buscan. */
export const NOISE_TYPES = new Set([
  'BreadcrumbList', 'WebSite', 'WebPage', 'SearchAction', 'SiteNavigationElement', 'ImageObject', 'ListItem',
  'Organization', 'Corporation', 'SearchResultsPage', 'CollectionPage', 'ItemPage', 'WPHeader', 'WPFooter',
  'SiteNavigationElement', 'ReadAction', 'Person_',
]);

function parseJson(raw: string): unknown {
  const clean = raw.replace(/^\s*<!--/, '').replace(/-->\s*$/, '').replace(/^\s*\/\*<!\[CDATA\[\*\//, '').replace(/\/\*\]\]>\*\/\s*$/, '').trim();
  try { return JSON.parse(clean); } catch { /* intenta reparar */ }
  try { return JSON.parse(clean.replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u001f]+/g, ' ')); } catch { return null; }
}

/** Sustituye { "@id": "…" } por el nodo al que apunta (grafos tipo Yoast). Un nivel y sin ciclos. */
function resolveRefs(v: unknown, byId: Map<string, Record<string, unknown>>, seen = new Set<string>(), depth = 0): unknown {
  if (depth > 4) return v;
  if (Array.isArray(v)) return v.map((x) => resolveRefs(x, byId, seen, depth + 1));
  if (!isObj(v)) return v;
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === '@id' && typeof v['@id'] === 'string') {
    const id = v['@id'];
    const target = byId.get(id);
    if (target && !seen.has(id)) return resolveRefs(target, byId, new Set(seen).add(id), depth + 1);
    return v;
  }
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveRefs(x, byId, seen, depth + 1)]));
}

function strip(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(strip);
  if (!isObj(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === '@context') continue;
    out[k === '@type' ? 'type' : k] = k === '@type' ? shortType(x) : strip(x);
  }
  return out;
}

function collect(v: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(v)) { v.forEach((x) => collect(x, out)); return; }
  if (!isObj(v)) return;
  if (Array.isArray(v['@graph'])) collect(v['@graph'], out);
  if (v['@type']) out.push(v);
}

export function extractJsonLd(root: ParentNode): Entity[] {
  const nodes: Record<string, unknown>[] = [];
  for (const s of root.querySelectorAll('script[type="application/ld+json" i]')) collect(parseJson(s.textContent ?? ''), nodes);

  const byId = new Map<string, Record<string, unknown>>();
  for (const n of nodes) if (typeof n['@id'] === 'string') byId.set(n['@id'], n);

  const entities: Entity[] = [];
  for (const n of nodes) {
    const resolved = strip(resolveRefs(n, byId)) as Record<string, unknown>;
    const type = shortType(n['@type']);
    if (!type) continue;

    if (type === 'ItemList' && Array.isArray(resolved.itemListElement)) {
      for (const el of resolved.itemListElement as unknown[]) {
        const item = isObj(el) && isObj(el.item) ? el.item : el;
        if (!isObj(item)) continue;
        const t = shortType(item.type ?? 'ListItem') || 'ListItem';
        entities.push({ type: t, source: 'jsonld', data: item, noise: t === 'ListItem' && !item.name && !item.url });
      }
      continue;
    }
    entities.push({ type, source: 'jsonld', data: resolved, noise: NOISE_TYPES.has(type) });
  }
  return dedupe(entities);
}

function dedupe(list: Entity[]): Entity[] {
  const seen = new Set<string>();
  return list.filter((e) => { const k = e.type + JSON.stringify(e.data); if (seen.has(k)) return false; seen.add(k); return true; });
}
