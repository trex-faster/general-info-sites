import type { DomSpec } from '@/core/types';
import type { Row } from '@/engines/types';

export function extractDom(root: ParentNode, spec: DomSpec): Row[] {
  return [...root.querySelectorAll(spec.rowSelector)].map((el) => {
    const row: Row = {};
    for (const c of spec.columns) {
      const t = c.selector ? el.querySelector(c.selector) : el;
      row[c.name] = !t ? '' : c.attr ? t.getAttribute(c.attr) ?? '' : (t.textContent ?? '').trim().replace(/\s+/g, ' ');
    }
    return row;
  });
}

/** Una línea por columna: nombre=selector@atributo (selector vacío = el propio elemento). */
export function parseDomColumns(text: string): DomSpec['columns'] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const eq = l.indexOf('=');
    const name = eq < 0 ? l : l.slice(0, eq).trim();
    const rest = eq < 0 ? l : l.slice(eq + 1).trim();
    const at = rest.lastIndexOf('@');
    return at >= 0 && !rest.slice(at).includes(' ') && !rest.slice(at).includes(']')
      ? { name, selector: rest.slice(0, at).trim(), attr: rest.slice(at + 1) }
      : { name, selector: rest };
  });
}
