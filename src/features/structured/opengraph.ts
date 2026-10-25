import type { Entity, PageMeta } from './types';
import { abs, text } from './util';

const metaVal = (doc: ParentNode, sel: string) => doc.querySelector(sel)?.getAttribute('content')?.trim() || '';

/** Metadatos de la página: título, descripción, canónica, idioma, OpenGraph, Twitter, precio declarado. */
export function readMeta(doc: Document, url: string): PageMeta {
  const m = (k: string) => metaVal(doc, `meta[property="${k}"], meta[name="${k}"]`);
  const meta: PageMeta = {
    title: m('og:title') || m('twitter:title') || text(doc.querySelector('title')),
    description: m('og:description') || m('description') || m('twitter:description'),
    image: abs(m('og:image') || m('twitter:image'), url),
    siteName: m('og:site_name'),
    type: m('og:type'),
    canonical: abs(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), url),
    lang: doc.documentElement?.getAttribute('lang') ?? '',
    author: m('author') || m('article:author'),
    published: m('article:published_time') || m('og:updated_time') || m('date'),
    keywords: m('keywords'),
    robots: m('robots'),
    price: m('product:price:amount') || m('og:price:amount'),
    currency: m('product:price:currency') || m('og:price:currency'),
    favicon: abs(doc.querySelector('link[rel~="icon"]')?.getAttribute('href') || '/favicon.ico', url),
  };
  for (const k of Object.keys(meta)) if (!meta[k]) delete meta[k];
  return meta;
}

export function readFeeds(doc: Document, url: string): string[] {
  return [...doc.querySelectorAll('link[rel="alternate"]')]
    .filter((l) => /(rss|atom|feed|xml)/i.test(l.getAttribute('type') ?? ''))
    .map((l) => abs(l.getAttribute('href'), url))
    .filter(Boolean);
}

/** OpenGraph cuenta como "dato" solo si describe un producto o un artículo; si no, queda en `meta`. */
export function extractOpenGraph(meta: PageMeta): Entity[] {
  const t = (meta.type ?? '').toLowerCase();
  if (t.includes('product') || meta.price) {
    return [{ type: 'Product', source: 'opengraph', data: pick(meta, ['title', 'description', 'image', 'price', 'currency', 'canonical', 'siteName']) }];
  }
  if (t.includes('article') || t.includes('blog') || t.includes('news')) {
    return [{ type: 'Article', source: 'opengraph', data: pick(meta, ['title', 'description', 'image', 'author', 'published', 'canonical', 'siteName']) }];
  }
  return [];
}

const pick = (o: PageMeta, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k]).map((k) => [k, o[k]]));
