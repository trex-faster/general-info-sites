import type { Entity } from './types';
import { NOISE_TYPES } from './jsonld';
import { abs, shortType, text } from './util';

interface Dialect { scope: string; prop: string; type: (el: Element) => string; value: (el: Element, base: string) => string | null }

const MICRODATA: Dialect = {
  scope: 'itemscope',
  prop: 'itemprop',
  type: (el) => shortType((el.getAttribute('itemtype') ?? '').split(/\s+/)[0]),
  value: (el, base) => {
    const t = el.tagName.toLowerCase();
    if (t === 'meta') return el.getAttribute('content');
    const content = el.getAttribute('content'); // no es del estándar, pero muchas plantillas lo usan en <span itemprop="price" content="49.5">
    if (content != null && !['a', 'area', 'link', 'img', 'time'].includes(t)) return content;
    if (t === 'a' || t === 'area' || t === 'link') return abs(el.getAttribute('href'), base);
    if (['img', 'audio', 'video', 'source', 'iframe', 'embed'].includes(t)) return abs(el.getAttribute('src'), base);
    if (t === 'time') return el.getAttribute('datetime') ?? text(el);
    if (t === 'data' || t === 'meter') return el.getAttribute('value') ?? text(el);
    return null;
  },
};

// RDFa‑lite (typeof / property): lo que usan la mayoría de plantillas.
const RDFA: Dialect = {
  scope: 'typeof',
  prop: 'property',
  type: (el) => shortType((el.getAttribute('typeof') ?? '').split(/\s+/)[0]),
  value: (el, base) => {
    const c = el.getAttribute('content');
    if (c != null) return c;
    const t = el.tagName.toLowerCase();
    if (t === 'a' || t === 'link') return abs(el.getAttribute('href') ?? el.getAttribute('resource'), base);
    if (t === 'img' || t === 'source') return abs(el.getAttribute('src'), base);
    if (t === 'time') return el.getAttribute('datetime') ?? text(el);
    return null;
  },
};

function readScope(el: Element, d: Dialect, base: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const add = (names: string, v: unknown) => {
    for (const n of names.split(/\s+/).filter(Boolean)) {
      const key = n.split(/[/#:]/).pop() ?? n;
      if (key in data) data[key] = Array.isArray(data[key]) ? [...(data[key] as unknown[]), v] : [data[key], v];
      else data[key] = v;
    }
  };
  const walk = (parent: Element) => {
    for (const child of parent.children) {
      const names = child.getAttribute(d.prop);
      const isScope = child.hasAttribute(d.scope);
      if (names) {
        if (isScope) add(names, { type: d.type(child), ...readScope(child, d, base) });
        else { add(names, d.value(child, base) ?? text(child)); walk(child); }
      } else if (!isScope) walk(child); // un itemscope sin itemprop es otro ítem independiente
    }
  };
  walk(el);
  return data;
}

function run(root: ParentNode, d: Dialect, base: string): Entity[] {
  const out: Entity[] = [];
  for (const el of root.querySelectorAll(`[${d.scope}]`)) {
    if (el.hasAttribute(d.prop)) continue; // propiedad anidada: ya vive dentro de su padre
    const type = d.type(el);
    if (!type) continue;
    out.push({ type, source: 'microdata', data: readScope(el, d, base), noise: NOISE_TYPES.has(type) });
  }
  return out;
}

export function extractMicrodata(root: ParentNode, base: string): Entity[] {
  return [...run(root, MICRODATA, base), ...run(root, RDFA, base)];
}
