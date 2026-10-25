import type { Capture } from '@/core/types';
import { engine } from '@/engines';
import { parseBody } from '@/features/extract/parse';
import type { ListResult, StrategyResult } from './types';

const short = (u: string) => { try { const x = new URL(u); return x.pathname + x.search.slice(0, 30); } catch { return u.slice(0, 50); } };

/**
 * Paso 2 de la cascada: las APIs internas que ya captura la extensión (fetch/XHR/GraphQL/JSON embebido).
 * Reutiliza el motor de colecciones: cada colección candidata se convierte en una lista con columnas sugeridas.
 */
export function embeddedFromCaptures(caps: Capture[], maxLists = 6): StrategyResult {
  const lists: ListResult[] = [];
  for (const c of caps) {
    if (c.format === 'html' || c.status >= 400) continue;
    const data = parseBody(c);
    if (data == null) continue;
    for (const cand of engine.findCandidates(data, 2)) {
      const items = engine.resolveCollection(data, cand.path);
      if (items.length < 2) continue;
      const cols = engine.suggestColumns(items);
      if (cols.length < 2) continue;
      const rows = engine.buildRows(items, cols);
      const score = Math.min(1, 0.5 + Math.min(items.length, 50) / 200 + Math.min(cols.length, 8) / 40);
      lists.push({ source: 'embedded', name: `${c.kind} ${c.operation ?? short(c.url)} · ${cand.path || '(raíz)'} (${items.length})`, rows, score });
    }
  }
  lists.sort((a, b) => b.rows.length * b.score - a.rows.length * a.score);
  return { strategy: 'embedded', entities: [], lists: lists.slice(0, maxLists) };
}
