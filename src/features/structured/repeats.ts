import type { DomSpec } from '@/core/types';
import type { Cell, Row } from '@/engines/types';
import type { ListResult } from './types';
import { abs, text } from './util';

const INLINE = new Set(['b', 'i', 'em', 'strong', 'small', 'sup', 'sub', 'mark', 'u', 's', 'del', 'ins', 'br', 'wbr', 'abbr', 'cite', 'code', 'bdi', 'font']);
const SKIP_PARENT = new Set(['script', 'style', 'select', 'option', 'head', 'svg', 'noscript', 'datalist', 'optgroup']);
const NAV_TAGS = new Set(['nav', 'header', 'footer', 'aside']);
const PRICE_RX = /(?:[$€£¥₹₽₩]|US\$|S\/\.?|R\$|USD|EUR|PEN|MXN|COP|ARS|CLP|GBP)\s?\d|\d\s?(?:[$€£]|USD|EUR|PEN|MXN)\b/i;
const MAX_SCAN = 6000;
const MAX_ROWS = 2000;

const HASHED = /^(css|sc|jsx|emotion|svelte|styled|_)[-_]|\d{4,}|^[a-z]{1,3}[A-Z0-9][A-Za-z0-9]{4,}$/;
const STATE = /^(active|selected|current|first|last|odd|even|hover|focus|open|closed|hidden|show|is-[\w-]+|has-[\w-]+|js-[\w-]+)$/i;
export const stableClasses = (el: Element): string[] =>
  [...(el.classList ?? [])].filter((c) => !HASHED.test(c) && !STATE.test(c) && /^[\w-]+$/.test(c));

const esc = (s: string) => s.replace(/[^\w-]/g, '\\$&');
const segment = (el: Element, withNth = false): string => {
  const tag = el.tagName.toLowerCase();
  const cls = stableClasses(el).slice(0, 2).map((c) => '.' + esc(c)).join('');
  if (!withNth) return tag + cls;
  const same = [...(el.parentElement?.children ?? [])].filter((s) => s.tagName === el.tagName);
  return same.length > 1 ? `${tag}${cls}:nth-of-type(${same.indexOf(el) + 1})` : tag + cls;
};

const stableId = (el: Element) => !!el.id && /^[\w-]+$/.test(el.id) && !/\d{3,}/.test(el.id);

/**
 * Selector más corto que identifica a `el` de forma única dentro de `scope`.
 * `stop` (excluido) corta la subida: para campos de una tarjeta se pasa la propia tarjeta.
 */
export function shortestUnique(scope: ParentNode, el: Element, stop?: Element | null): string {
  const chain: Element[] = [];
  for (let c: Element | null = el; c && c !== stop && c.tagName.toLowerCase() !== 'html'; c = c.parentElement) {
    chain.unshift(c);
    if (stableId(c)) break;
  }
  const seg = (c: Element, nth: boolean) => (stableId(c) ? '#' + c.id : segment(c, nth));
  for (const nth of [false, true]) {
    for (let n = 1; n <= chain.length; n++) {
      const sel = chain.slice(-n).map((c) => seg(c, nth)).join(' > ');
      try {
        const found = scope.querySelectorAll(sel);
        if (found.length === 1 && found[0] === el) return sel;
      } catch { /* selector inválido: prueba otro */ }
    }
  }
  return chain.map((c) => seg(c, true)).join(' > ');
}

// ───────────────────────── tablas ─────────────────────────

function tables(doc: Document): ListResult[] {
  const out: ListResult[] = [];
  for (const t of doc.querySelectorAll('table')) {
    const trs = [...t.querySelectorAll('tr')].filter((r) => r.closest('table') === t);
    if (trs.length < 3) continue;
    const first = [...trs[0]!.children];
    const hasHead = first.length > 0 && first.every((c) => c.tagName === 'TH');
    const body = hasHead ? trs.slice(1) : trs;
    const colCount = Math.max(...body.map((r) => r.children.length));
    if (colCount < 2) continue;
    const names = Array.from({ length: colCount }, (_, i) => (hasHead && text(first[i])) || `col${i + 1}`);
    const uniq = dedupeNames(names);
    const tsel = shortestUnique(doc, t);
    const spec: DomSpec = {
      rowSelector: hasHead ? `${tsel} tr:not(:first-child)` : `${tsel} tr`,
      columns: uniq.map((name, i) => ({ name, selector: `td:nth-child(${i + 1}), th:nth-child(${i + 1})` })),
    };
    const rows: Row[] = body.slice(0, MAX_ROWS).map((r) => {
      const row: Row = {};
      uniq.forEach((n, i) => { row[n] = text(r.children[i]); });
      return row;
    });
    out.push({ source: 'repeats', name: `Tabla (${tsel})`, rows, spec, score: Math.min(0.95, 0.55 + rows.length / 60) });
  }
  return out;
}

function dedupeNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => { const c = (seen.get(n) ?? 0) + 1; seen.set(n, c); return c > 1 ? `${n}_${c}` : n; });
}

// ───────────────────────── grupos repetidos ─────────────────────────

const sig = (el: Element) => el.tagName.toLowerCase() + '.' + stableClasses(el).join('.');

const hasTextChild = (el: Element) => [...el.children].some((c) => text(c).length > 0);
function isLeaf(el: Element): boolean {
  if (el.children.length === 0) return true;
  return [...el.children].every((c) => INLINE.has(c.tagName.toLowerCase()) || (c.tagName === 'SPAN' && stableClasses(c).length === 0) || !hasTextChild(c) && text(c) === '');
}

interface Field { sel: string; attr?: string; el: Element; kind: 'text' | 'href' | 'src' | 'alt' | 'datetime' }

function fieldsOf(item: Element): Field[] {
  const out: Field[] = [];
  const els = [item, ...item.querySelectorAll('*')];
  for (const el of els) {
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'svg', 'noscript', 'template'].includes(tag)) continue;
    if (el.closest('svg')) continue;
    const sel = el === item ? '' : shortestUnique(item, el, item);
    if (tag === 'a' && el.getAttribute('href') && !el.getAttribute('href')!.startsWith('#')) out.push({ sel, attr: 'href', el, kind: 'href' });
    if (tag === 'img') {
      const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('srcset');
      if (src) out.push({ sel, attr: el.getAttribute('src') ? 'src' : el.getAttribute('data-src') ? 'data-src' : el.getAttribute('data-lazy-src') ? 'data-lazy-src' : 'srcset', el, kind: 'src' });
      if (el.getAttribute('alt')) out.push({ sel, attr: 'alt', el, kind: 'alt' });
    }
    if (tag === 'time' && el.getAttribute('datetime')) out.push({ sel, attr: 'datetime', el, kind: 'datetime' });
    if (isLeaf(el) && text(el) && !['img', 'select', 'option', 'textarea', 'input'].includes(tag)) out.push({ sel, el, kind: 'text' });
  }
  return out;
}

const lastClassToken = (el: Element) => stableClasses(el).map((c) => c.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')).filter((c) => c.length > 2 && !/^(item|col|row|wrap|wrapper|container|inner|box|block|text|link|content|card|cell|product|list|ui)$/.test(c)).pop();

function nameField(f: Field, sampleText: string, item: Element): string {
  const el = f.el;
  const tag = el.tagName.toLowerCase();
  const own = (e: Element) => [e.getAttribute('itemprop'), e.className?.toString?.() ?? '', e.id, e.getAttribute('data-testid') ?? ''].join(' ');
  // contexto: el propio elemento y hasta 2 ancestros dentro de la tarjeta (p. ej. <div class="price-box"><span>…)
  const ups: Element[] = [];
  for (let c = el.parentElement; c && c !== item && ups.length < 2; c = c.parentElement) ups.push(c);
  const ctx = [own(el), ...ups.map(own)].join(' ').toLowerCase();
  const inHeading = el.closest('h1,h2,h3,h4,h5,h6') && item.contains(el.closest('h1,h2,h3,h4,h5,h6'));
  if (f.kind === 'href') return 'enlace';
  if (f.kind === 'src') return 'imagen';
  if (f.kind === 'alt') return 'imagen_alt';
  if (f.kind === 'datetime') return 'fecha';
  const ip = el.getAttribute('itemprop');
  if (ip && /^[\w-]+$/.test(ip)) return ip.toLowerCase();
  if (/\b(old|before|antes|was|regular|strike|tachado|list-?price)\b/.test(ctx) && /pric|prec|cost/.test(ctx)) return 'precio_antes';
  if (tag === 'del' || tag === 's') return 'precio_antes';
  if (/pric|prec|cost|amount|importe/.test(ctx) || PRICE_RX.test(sampleText)) return 'precio';
  if (/rating|stars?|review|valoraci|opini|puntu/.test(ctx)) return 'valoracion';
  if (/discount|descuento|off\b|sale|oferta|promo/.test(ctx)) return 'oferta';
  if (/\b(date|fecha|time|published)\b/.test(ctx) || tag === 'time') return 'fecha';
  if (/brand|marca|vendor|seller/.test(ctx)) return 'marca';
  if (/sku|ref\b|codigo|code|model/.test(ctx)) return 'codigo';
  if (/author|autor|by-?line/.test(ctx)) return 'autor';
  if (/desc|summary|resumen|excerpt|snippet/.test(ctx)) return 'descripcion';
  if (/category|categor|tag\b/.test(ctx)) return 'categoria';
  if (/^h[1-6]$/.test(tag) || inHeading || /title|name|nombre|titulo|heading/.test(ctx)) return 'titulo';
  return lastClassToken(el) ?? (tag === 'p' ? 'texto' : tag === 'li' ? 'texto' : 'campo');
}

function readField(item: Element, f: { sel: string; attr?: string }, base: string): string {
  let t: Element | null = item;
  if (f.sel) { try { t = item.querySelector(f.sel); } catch { t = null; } }
  if (!t) return '';
  if (!f.attr) return text(t);
  const v = t.getAttribute(f.attr) ?? '';
  if (f.attr === 'href' || f.attr === 'src' || f.attr === 'data-src' || f.attr === 'data-lazy-src') return abs(v, base);
  if (f.attr === 'srcset') return abs((v.split(',')[0] ?? '').trim().split(/\s+/)[0], base);
  return v;
}

interface Group { parent: Element; items: Element[]; selector: string }

function groups(doc: Document): Group[] {
  const out: Group[] = [];
  let scanned = 0;
  for (const parent of doc.querySelectorAll('body *')) {
    if (++scanned > MAX_SCAN) break;
    if (parent.children.length < 3 || SKIP_PARENT.has(parent.tagName.toLowerCase())) continue;
    const bySig = new Map<string, Element[]>();
    for (const c of parent.children) {
      if (['script', 'style', 'template', 'noscript', 'br', 'hr'].includes(c.tagName.toLowerCase())) continue;
      const s = sig(c);
      bySig.set(s, [...(bySig.get(s) ?? []), c]);
    }
    for (const [s, items] of bySig) {
      if (items.length < 3) continue;
      const pSel = shortestUnique(doc, parent);
      const dot = s.indexOf('.');
      const tag = s.slice(0, dot);
      const cls = s.slice(dot + 1).split('.').filter(Boolean).map((c) => '.' + esc(c)).join('');
      out.push({ parent, items, selector: `${pSel} > ${tag}${cls}` });
    }
  }
  return out;
}

function inNav(el: Element): boolean {
  for (let c: Element | null = el; c; c = c.parentElement) {
    if (NAV_TAGS.has(c.tagName.toLowerCase())) return true;
    const role = c.getAttribute('role');
    if (role && /navigation|menu|banner|contentinfo|complementary/.test(role)) return true;
  }
  return false;
}

function buildList(g: Group, doc: Document, base: string): ListResult | null {
  const items = g.items.slice(0, MAX_ROWS);
  const sample = items.slice(0, Math.min(items.length, 12));
  const perItem = sample.map((it) => fieldsOf(it));
  const freq = new Map<string, { f: Field; n: number; kindOrder: number }>();
  perItem.forEach((fs) => {
    const seen = new Set<string>();
    fs.forEach((f, idx) => {
      const k = `${f.kind}|${f.sel}|${f.attr ?? ''}`;
      if (seen.has(k)) return;
      seen.add(k);
      const cur = freq.get(k);
      if (cur) cur.n++; else freq.set(k, { f, n: 1, kindOrder: idx });
    });
  });
  const min = Math.max(2, Math.ceil(sample.length * 0.5));
  let cols = [...freq.values()].filter((x) => x.n >= min).sort((a, b) => a.kindOrder - b.kindOrder);
  // un `a` que contiene solo un `img` o solo texto ya cubierto no aporta columna de texto duplicada
  const texts = new Set<string>();
  cols = cols.filter((c) => {
    if (c.f.kind !== 'text') return true;
    const t = text(c.f.el);
    const key = c.f.sel + '|' + t;
    if (texts.has(key)) return false;
    texts.add(key);
    return true;
  }).slice(0, 14);
  if (cols.length < 2) return null;

  // columnas con valores idénticos en todas las filas (p. ej. dos enlaces al mismo producto) se quedan en una
  const seenVals = new Set<string>();
  cols = cols.filter((c) => {
    const key = items.map((it) => readField(it, { sel: c.f.sel, attr: c.f.attr }, base)).join('\u0001');
    if (seenVals.has(key)) return false;
    seenVals.add(key);
    return true;
  });
  if (cols.length < 2) return null;

  const names = dedupeNames(cols.map((c) => nameField(c.f, text(c.f.el), sample[0]!)));
  const spec: DomSpec = {
    rowSelector: g.selector,
    columns: cols.map((c, i) => ({ name: names[i] ?? `campo_${i + 1}`, selector: c.f.sel, ...(c.f.attr ? { attr: c.f.attr } : {}) })),
  };
  const rows: Row[] = items.map((it) => {
    const row: Row = {};
    spec.columns.forEach((c) => { row[c.name] = readField(it, { sel: c.selector, attr: c.attr }, base) as Cell; });
    return row;
  });

  const nonEmpty = rows.filter((r) => Object.values(r).some((v) => String(v).trim() !== '')).length;
  if (nonEmpty < 3) return null;
  const hasLink = names.includes('enlace');
  const hasImg = names.includes('imagen');
  const hasPrice = names.includes('precio');
  const avgText = rows.reduce((s, r) => s + Object.values(r).join('').length, 0) / rows.length;
  if (avgText < 12 && !hasImg) return null;

  let score = Math.min(0.3, Math.log2(items.length) / 14)
    + Math.min(0.3, cols.length / 5 * 0.3)
    + (hasLink ? 0.12 : 0) + (hasImg ? 0.1 : 0) + (hasPrice ? 0.2 : 0)
    + (names.includes('titulo') ? 0.08 : 0);
  if (inNav(g.parent)) score *= 0.3;
  if (cols.length <= 2 && hasLink && !hasPrice) score *= 0.5; // lista de enlaces (menús, migas, etiquetas)
  if (doc.querySelectorAll(g.selector).length > items.length * 1.5) score *= 0.7; // selector poco preciso

  const label = hasPrice ? 'Lista de productos' : hasLink && names.includes('titulo') ? 'Lista de elementos' : 'Lista repetida';
  return { source: 'repeats', name: `${label} (${items.length}) · ${g.selector}`, rows, spec, score: Math.min(1, Number(score.toFixed(3))) };
}

/** Detecta tablas y bloques repetidos (tarjetas de producto, resultados, filas) y propone columnas. */
export function extractRepeats(doc: Document, base: string): ListResult[] {
  const lists: ListResult[] = [...tables(doc)];
  const picked: Element[] = [];
  const cands = groups(doc)
    .map((g) => ({ g, l: buildList(g, doc, base) }))
    .filter((x): x is { g: Group; l: ListResult } => !!x.l && x.l.score >= 0.25)
    .sort((a, b) => b.l.score - a.l.score);
  for (const { g, l } of cands) {
    // evita listas anidadas dentro de una ya elegida (o que la contengan)
    if (picked.some((p) => p.contains(g.parent) || g.parent.contains(p))) continue;
    picked.push(g.parent);
    lists.push(l);
    if (lists.length >= 8) break;
  }
  return lists.sort((a, b) => b.score - a.score);
}

/** Una lista cuenta como "dato real" si la confianza es suficiente. */
export const LIST_MIN_SCORE = 0.45;
