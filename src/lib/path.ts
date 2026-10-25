const WILD = Symbol('wild');
type Seg = string | number | typeof WILD;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parsePath(p: string): Seg[] {
  const s = p.trim().replace(/^\$\.?/, '');
  const out: Seg[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '.') { i++; continue; }
    if (c === '[') {
      const j = s.indexOf(']', i);
      if (j < 0) throw new Error('Ruta inválida: falta ]');
      const inner = s.slice(i + 1, j).trim();
      i = j + 1;
      if (inner === '*' || inner === '') out.push(WILD);
      else if (/^\d+$/.test(inner)) out.push(Number(inner));
      else if (/^(['"]).*\1$/.test(inner)) out.push(inner.slice(1, -1));
      else out.push(inner);
    } else {
      let j = i;
      while (j < s.length && s[j] !== '.' && s[j] !== '[') j++;
      const k = s.slice(i, j);
      i = j;
      out.push(k === '*' ? WILD : k);
    }
  }
  return out;
}

export function queryPath(data: unknown, path: string): unknown[] {
  let cur: unknown[] = [data];
  for (const sg of parsePath(path)) {
    const next: unknown[] = [];
    for (const v of cur) {
      if (v == null || typeof v !== 'object') continue;
      if (sg === WILD) {
        for (const x of Array.isArray(v) ? v : Object.values(v)) next.push(x);
      } else if (Array.isArray(v)) {
        if (typeof sg === 'number') { if (v[sg] !== undefined) next.push(v[sg]); }
        else for (const it of v) if (isObj(it) && sg in it) next.push(it[sg]);
      } else if (String(sg) in v) next.push((v as Record<string, unknown>)[String(sg)]);
    }
    cur = next;
  }
  return cur;
}

function expand(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (isObj(v)) {
    const vals = Object.values(v);
    if (vals.length >= 2 && vals.every(isObj)) return Object.entries(v).map(([k, x]) => ({ _key: k, ...(x as object) }));
  }
  return v === undefined ? [] : [v];
}

/** Devuelve la lista de ítems a la que apunta la ruta (arrays, mapas por clave o resultados de comodines). */
export function resolveCollection(data: unknown, path: string): unknown[] {
  const res = path.trim() ? queryPath(data, path) : [data];
  if (res.length === 1) return expand(res[0]);
  const out: unknown[] = [];
  for (const r of res) for (const x of expand(r)) out.push(x);
  return out;
}

const IDENT = /^[A-Za-z_$][\w$]*$/;
export const appendKey = (base: string, key: string | number) =>
  typeof key === 'number' ? `${base}[${key}]` : IDENT.test(key) ? (base ? `${base}.${key}` : key) : `${base}["${key.replace(/"/g, '\\"')}"]`;

export interface Candidate { path: string; count: number; keys: string[]; map?: boolean; score: number }

export function findCandidates(data: unknown, limit = 15): Candidate[] {
  const out: Candidate[] = [];
  let visits = 0;
  const keysOf = (items: unknown[]) => {
    const freq = new Map<string, number>();
    for (const it of items.slice(0, 20)) if (isObj(it)) for (const k of Object.keys(it)) freq.set(k, (freq.get(k) ?? 0) + 1);
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  };
  const walk = (v: unknown, path: string, depth: number) => {
    if (depth > 9 || visits++ > 100_000 || v == null || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      const objs = v.filter(isObj).length;
      if (v.length >= 2 && objs / v.length >= 0.7) {
        const keys = keysOf(v);
        out.push({ path, count: v.length, keys: keys.slice(0, 8), score: v.length * Math.min(keys.length, 12) });
        return;
      }
      v.slice(0, 3).forEach((x, i) => walk(x, appendKey(path, i), depth + 1));
      return;
    }
    const entries = Object.entries(v);
    if (entries.length >= 3 && entries.every(([, x]) => isObj(x))) {
      const first = new Set(Object.keys(entries[0]![1] as object));
      const similar = entries.filter(([, x]) => {
        const ks = Object.keys(x as object);
        return ks.length > 0 && ks.filter((k) => first.has(k)).length / Math.max(ks.length, first.size) >= 0.5;
      }).length;
      if (similar / entries.length >= 0.7) {
        out.push({ path, count: entries.length, keys: keysOf(entries.map(([, x]) => x)).slice(0, 8), map: true, score: entries.length * 6 });
        return;
      }
    }
    for (const [k, x] of entries) walk(x, appendKey(path, k), depth + 1);
  };
  walk(data, '', 0);
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
