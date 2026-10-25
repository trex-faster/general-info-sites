import type { Row } from '@/engines/types';
import { abs } from './util';

export interface RobotsInfo { sitemaps: string[]; disallow: string[]; allow: string[]; crawlDelay?: number }

/** Interpreta robots.txt para el grupo `User-agent: *` y lista los sitemaps declarados. */
export function parseRobots(txt: string, origin: string): RobotsInfo {
  const out: RobotsInfo = { sitemaps: [], disallow: [], allow: [] };
  let inStar = false;
  let sawAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (k === 'sitemap') { out.sitemaps.push(abs(v, origin)); continue; }
    if (k === 'user-agent') { if (!sawAgent) inStar = false; sawAgent = true; if (v === '*') inStar = true; continue; }
    sawAgent = false;
    if (!inStar) continue;
    if (k === 'disallow' && v) out.disallow.push(v);
    else if (k === 'allow' && v) out.allow.push(v);
    else if (k === 'crawl-delay' && Number.isFinite(Number(v))) out.crawlDelay = Number(v);
  }
  return out;
}

/** ¿Permite robots.txt esta ruta? (Allow más largo gana sobre Disallow; soporta * y $.) */
export function isAllowed(info: RobotsInfo, path: string): boolean {
  const rx = (p: string) => new RegExp('^' + p.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\$$/, '$'));
  const best = (list: string[]) => list.filter((p) => rx(p).test(path)).reduce((m, p) => Math.max(m, p.length), -1);
  return best(info.allow) >= best(info.disallow);
}

export interface SitemapInfo { kind: 'index' | 'urlset'; locs: string[] }

export function parseSitemap(xml: string): SitemapInfo {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? 'index' : 'urlset';
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => (m[1] ?? '').replace(/&amp;/g, '&'));
  return { kind, locs };
}

/** RSS / Atom → filas (título, enlace, fecha, resumen, autor). */
export function parseFeed(xml: string): Row[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const items = [...doc.getElementsByTagName('item'), ...doc.getElementsByTagName('entry')];
  const t = (el: Element, ...names: string[]) => {
    for (const n of names) { const f = el.getElementsByTagName(n)[0]; if (f?.textContent?.trim()) return f.textContent.trim(); }
    return '';
  };
  return items.map((it) => {
    const atomLink = [...it.getElementsByTagName('link')].find((l) => l.getAttribute('href'));
    return {
      titulo: t(it, 'title'),
      enlace: atomLink?.getAttribute('href') ?? t(it, 'link'),
      fecha: t(it, 'pubDate', 'published', 'updated', 'dc:date'),
      resumen: t(it, 'description', 'summary', 'content:encoded').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500),
      autor: t(it, 'dc:creator', 'author', 'name'),
    };
  });
}

export interface SiteMap {
  origin: string;
  robots?: RobotsInfo;
  sitemaps: string[];
  urls: string[];
  truncated: boolean;
  errors: string[];
}

/**
 * Mapa del sitio: robots.txt → sitemaps (siguiendo índices) → URLs. `fetchText` se inyecta
 * (en el panel es `fetch`; en pruebas, un simulador). Los .gz se omiten y quedan anotados en `errors`.
 */
export async function discoverSite(
  origin: string,
  fetchText: (url: string) => Promise<string | null>,
  opts: { maxSitemaps?: number; maxUrls?: number } = {},
): Promise<SiteMap> {
  const maxSitemaps = opts.maxSitemaps ?? 8;
  const maxUrls = opts.maxUrls ?? 5000;
  const res: SiteMap = { origin, sitemaps: [], urls: [], truncated: false, errors: [] };

  const robotsTxt = await fetchText(origin + '/robots.txt').catch(() => null);
  if (robotsTxt) res.robots = parseRobots(robotsTxt, origin);
  const queue = [...new Set([...(res.robots?.sitemaps ?? []), origin + '/sitemap.xml'])];
  const seen = new Set<string>();
  const urls = new Set<string>();

  while (queue.length && seen.size < maxSitemaps) {
    const u = queue.shift()!;
    if (seen.has(u)) continue;
    seen.add(u);
    if (/\.gz($|\?)/i.test(u)) { res.errors.push('Sitemap comprimido (.gz) omitido: ' + u); continue; }
    const xml = await fetchText(u).catch(() => null);
    if (!xml) { res.errors.push('No se pudo leer ' + u); continue; }
    res.sitemaps.push(u);
    const sm = parseSitemap(xml);
    if (sm.kind === 'index') queue.push(...sm.locs);
    else for (const l of sm.locs) { urls.add(l); if (urls.size >= maxUrls) { res.truncated = true; break; } }
    if (res.truncated) break;
  }
  if (queue.length && !res.truncated) res.truncated = true;
  res.urls = [...urls];
  return res;
}
