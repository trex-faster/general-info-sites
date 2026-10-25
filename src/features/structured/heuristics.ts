import type { Entity, PageMeta } from './types';
import { abs, parsePrice, text } from './util';

const PRICE_RX = /(?:[$€£¥₹₽₩]|US\$|S\/\.?|R\$|USD|EUR|PEN|MXN|COP|ARS|CLP|GBP)\s?\d[\d.,\s]*|\d[\d.,\s]*\s?(?:[$€£]|USD|EUR|PEN|MXN)\b/i;
const SOCIAL = /(facebook|instagram|twitter|x|linkedin|youtube|tiktok|t|wa|whatsapp|pinterest|github)\.(com|me)\/?/i;

/** Contenedor con más texto "de párrafo" (menos enlaces): el cuerpo principal de un artículo. */
function mainText(doc: Document): { el: Element | null; text: string } {
  const direct = doc.querySelector('article, [role="main"] article, main article') ?? doc.querySelector('main, [role="main"]');
  const pool = direct ? [direct] : [...doc.querySelectorAll('div, section')];
  let best: Element | null = null;
  let bestScore = 0;
  for (const el of pool) {
    const ps = [...el.querySelectorAll('p')].filter((p) => text(p).length >= 40);
    const total = ps.reduce((s, p) => s + text(p).length, 0);
    const links = [...el.querySelectorAll('a')].reduce((s, a) => s + text(a).length, 0);
    const score = total - links * 0.6;
    if (score > bestScore) { best = el; bestScore = score; }
  }
  if (!best) return { el: null, text: '' };
  const paras = [...best.querySelectorAll('p')].map(text).filter((t) => t.length >= 25);
  return { el: best, text: paras.join('\n\n') };
}

function priceElements(doc: Document) {
  const found: { el: Element; raw: string; value: number }[] = [];
  for (const el of doc.querySelectorAll('[itemprop="price"], [class*="price" i], [class*="precio" i], [id*="price" i], [data-price]')) {
    const raw = el.getAttribute('content') ?? el.getAttribute('data-price') ?? text(el);
    if (!raw || raw.length > 40) continue;
    if (!PRICE_RX.test(raw) && !/^\d[\d.,]*$/.test(raw.trim())) continue;
    const value = parsePrice(raw);
    if (value != null && value > 0) found.push({ el, raw: raw.trim(), value });
  }
  return found;
}

export function extractHeuristics(doc: Document, url: string, meta: PageMeta): Entity[] {
  const out: Entity[] = [];
  const h1 = text(doc.querySelector('h1')) || meta.title || '';

  // Producto: un solo precio "principal" + título. Con muchos precios es un listado (lo cubre `repeats`).
  const prices = priceElements(doc);
  const distinct = new Set(prices.map((p) => p.value));
  if (h1 && prices.length > 0 && distinct.size <= 3) {
    const main = prices[0]!;
    const old = prices.find((p) => p.value > main.value);
    out.push({
      type: 'Product', source: 'heuristics',
      data: {
        name: h1, price: main.value, priceText: main.raw,
        ...(old ? { priceBefore: old.value } : {}),
        ...(meta.currency ? { currency: meta.currency } : {}),
        image: meta.image ?? abs(doc.querySelector('main img, article img, img')?.getAttribute('src'), url),
        url: meta.canonical ?? url,
      },
    });
  }

  // Artículo: bastante texto en párrafos + título.
  const main = mainText(doc);
  if (h1 && main.text.length >= 400) {
    const time = doc.querySelector('time[datetime]')?.getAttribute('datetime');
    const author = meta.author || text(doc.querySelector('[rel="author"], [itemprop="author"], .author, .byline, [class*="author" i]')).slice(0, 120);
    out.push({
      type: 'Article', source: 'heuristics',
      data: {
        title: h1,
        ...(author ? { author } : {}),
        ...(meta.published || time ? { published: meta.published || time } : {}),
        wordCount: main.text.split(/\s+/).length,
        text: main.text.slice(0, 8000),
        ...(meta.image ? { image: meta.image } : {}),
        url: meta.canonical ?? url,
      },
    });
  }

  // Contacto y redes: útil como contexto del sitio, pero no sustituye a los datos de la página.
  const emails = new Set<string>();
  const phones = new Set<string>();
  const social = new Set<string>();
  for (const a of doc.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href') ?? '';
    if (/^mailto:/i.test(h)) emails.add(h.replace(/^mailto:/i, '').split('?')[0] ?? '');
    else if (/^tel:/i.test(h)) phones.add(h.replace(/^tel:/i, ''));
    else if (SOCIAL.test(abs(h, url)) && /^https?:/i.test(abs(h, url))) social.add(abs(h, url));
  }
  if (emails.size || phones.size || social.size) {
    out.push({
      type: 'Contact', source: 'heuristics', noise: true,
      data: { emails: [...emails], phones: [...phones], social: [...social].slice(0, 12) },
    });
  }
  return out;
}
