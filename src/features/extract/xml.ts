/** Convierte un Element XML a objetos JS: atributos como "@attr", texto mixto en "#text", hijos repetidos como array. */
export function xmlToJs(el: Element): unknown {
  const attrs = [...el.attributes];
  const kids = [...el.children];
  const text = [...el.childNodes].filter((n) => n.nodeType === 3 || n.nodeType === 4).map((n) => n.textContent ?? '').join('').trim();
  if (!attrs.length && !kids.length) return text;
  const o: Record<string, unknown> = {};
  for (const a of attrs) o['@' + a.name] = a.value;
  for (const k of kids) {
    const v = xmlToJs(k);
    const prev = o[k.tagName];
    if (prev === undefined) o[k.tagName] = v;
    else if (Array.isArray(prev) && (prev as unknown[] & { __xml?: boolean }).__xml) prev.push(v);
    else { const arr: unknown[] & { __xml?: boolean } = [prev, v]; arr.__xml = true; o[k.tagName] = arr; }
  }
  if (text) o['#text'] = text;
  return o;
}
export function parseXml(text: string): unknown {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML inválido');
  return { [doc.documentElement.tagName]: xmlToJs(doc.documentElement) };
}
