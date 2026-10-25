export const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

export function abs(href: string | null | undefined, base: string): string {
  if (!href) return '';
  try { return new URL(href, base).href; } catch { return href; }
}

export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** "https://schema.org/Product" | "schema:Product" | "Product" → "Product" */
export const shortType = (t: unknown): string => {
  const s = Array.isArray(t) ? String(t.find((x) => x && x !== 'Thing') ?? t[0] ?? '') : String(t ?? '');
  return s.split(/[/#:]/).filter(Boolean).pop() ?? '';
};

/** Recorre `a.b.c` (con índices a[0]) sobre un objeto; devuelve undefined si no existe. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)) {
    if (cur == null) return undefined;
    if (Array.isArray(cur) && !/^\d+$/.test(k)) cur = cur.map((x) => (isObj(x) ? x[k] : undefined)).find((x) => x != null);
    else cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Texto de precio → número ("US$ 1.299,90" → 1299.9, "$1,299.90" → 1299.9). */
export function parsePrice(s: string): number | null {
  const m = s.replace(/\s/g, ' ').match(/\d[\d.,\s]*\d|\d/);
  if (!m) return null;
  let n = m[0].replace(/\s/g, '');
  const lastDot = n.lastIndexOf('.');
  const lastComma = n.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? '.' : ',';
    n = dec === '.' ? n.replace(/,/g, '') : n.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    n = /,\d{1,2}$/.test(n) ? n.replace(',', '.') : n.replace(/,/g, '');
  } else if (lastDot >= 0 && ((/\.\d{3}(\.|$)/.test(n) && n.split('.').length > 2) || /^[1-9]\d{0,2}\.\d{3}$/.test(n))) {
    n = n.replace(/\./g, ''); // "1.299" y "1.299.000": punto de miles
  }
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}
