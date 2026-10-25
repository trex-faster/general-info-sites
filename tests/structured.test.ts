import { DOMParser as LDOMParser, parseHTML } from 'linkedom';
import { analyzeDom, cascade, toTables, useful } from '@/features/structured/analyze';
import { extractJsonLd } from '@/features/structured/jsonld';
import { extractMicrodata } from '@/features/structured/microdata';
import { discoverSite, isAllowed, parseFeed, parseRobots, parseSitemap } from '@/features/structured/feeds';
import { applyRule, matchRule, orderFor, validateRule } from '@/features/structured/rules';
import { buildPrompt, cleanHtml, extractWithAi, parseAiJson, validate } from '@/features/structured/ai';
import { parsePrice } from '@/features/structured/util';
import type { SiteRule } from '@/features/structured/types';

const dom = (html: string) => parseHTML(html).document as unknown as Document;
beforeAll(() => { (globalThis as any).DOMParser = LDOMParser; });

// ── fixtures ────────────────────────────────────────────────────────────────
const cards = (n: number) => Array.from({ length: n }, (_, i) => `
  <div class="sc-aB3dE product-card">
    <a class="sc-xK9 link" href="/p/${i + 1}"><img class="thumb" src="/img/${i + 1}.jpg" alt="Zapatilla ${i + 1}"></a>
    <h3 class="title"><a href="/p/${i + 1}">Zapatilla modelo ${i + 1}</a></h3>
    <div class="price-box"><span class="price">S/ ${100 + i * 10}.90</span>${i % 2 ? '<del class="old-price">S/ 199.90</del>' : ''}</div>
    <p class="brand">Marca ${i % 3}</p>
  </div>`).join('');

const LISTING = `<!doctype html><html lang="es"><head><title>Zapatillas | Tienda</title>
  <meta property="og:site_name" content="Tienda"><link rel="canonical" href="https://tienda.test/zapatillas">
  <link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body>
  <header><nav><ul class="menu"><li><a href="/a">Inicio</a></li><li><a href="/b">Ofertas</a></li><li><a href="/c">Hombre</a></li><li><a href="/d">Mujer</a></li><li><a href="/e">Niños</a></li></ul></nav></header>
  <main><h1>Zapatillas</h1><div class="grid">${cards(8)}</div></main>
  <footer><a href="mailto:ventas@tienda.test">Escríbenos</a><a href="tel:+51999888777">Llámanos</a><a href="https://www.instagram.com/tienda">IG</a></footer>
  </body></html>`;

const PRODUCT_GRAPH = `<html><head><title>Zapatilla Run</title>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
 {"@type":"Organization","@id":"https://t.test/#org","name":"Tienda"},
 {"@type":"WebPage","@id":"https://t.test/p/1#page","isPartOf":{"@id":"https://t.test/#org"}},
 {"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Inicio"}]},
 {"@type":"Product","name":"Zapatilla Run","sku":"RUN-1","brand":{"@id":"https://t.test/#brand"},
  "offers":{"@type":"Offer","price":"259.90","priceCurrency":"PEN","availability":"https://schema.org/InStock"}},
 {"@type":"Brand","@id":"https://t.test/#brand","name":"Acme"}
]}</script>
<script type="application/ld+json">{"@type":"Product","name":"Roto","offers":{"price":10,},}</script>
</head><body><h1>Zapatilla Run</h1></body></html>`;

const ITEMLIST = `<html><body><script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[
 {"@type":"ListItem","position":1,"item":{"@type":"Product","name":"A","offers":{"price":"10"}}},
 {"@type":"ListItem","position":2,"item":{"@type":"Product","name":"B","offers":{"price":"20"}}}]}</script></body></html>`;

const ORG_ONLY_PLUS_CARDS = LISTING.replace('</head>', '<script type="application/ld+json">{"@type":"Organization","name":"Tienda","url":"https://tienda.test"}</script></head>');

const MICRODATA = `<html><body><div itemscope itemtype="https://schema.org/Product">
  <h1 itemprop="name">Mochila</h1><img itemprop="image" src="/m.jpg">
  <div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="priceCurrency" content="USD"><span itemprop="price" content="49.5">$49.50</span><link itemprop="availability" href="https://schema.org/InStock"></div>
  </div></body></html>`;

const RDFA = `<html><body><div vocab="https://schema.org/" typeof="Product"><span property="name">Taza</span><span property="sku">T-1</span></div></body></html>`;

const long = 'Este es un párrafo largo de ejemplo con bastante texto para que parezca contenido editorial real de una nota periodística. '.repeat(3);
const ARTICLE = `<html lang="es"><head><title>Titular | Diario</title>
 <meta property="og:type" content="article"><meta property="og:title" content="Titular de la nota"><meta name="author" content="Ana Pérez">
 <meta property="article:published_time" content="2026-10-01T10:00:00Z"></head><body>
 <header><a href="/">Diario</a></header><article><h1>Titular de la nota</h1><time datetime="2026-10-01">1 oct</time>
 <p>${long}</p><p>${long}</p><p>${long}</p></article><aside><p>Corto</p></aside></body></html>`;

const TABLE = `<html><body><table id="datos"><thead><tr><th>País</th><th>Capital</th><th>Población</th></tr></thead><tbody>
 <tr><td>Perú</td><td>Lima</td><td>33</td></tr><tr><td>Chile</td><td>Santiago</td><td>19</td></tr>
 <tr><td>Bolivia</td><td>Sucre</td><td>12</td></tr><tr><td>Ecuador</td><td>Quito</td><td>18</td></tr></tbody></table></body></html>`;

const URL_ = 'https://tienda.test/zapatillas';

// ── utilidades ──────────────────────────────────────────────────────────────
describe('parsePrice', () => {
  it.each([['S/ 1,299.90', 1299.9], ['US$ 1.299,90', 1299.9], ['$49.50', 49.5], ['1 299,90 €', 1299.9], ['12,5', 12.5], ['1.299', 1299], ['abc', null]])('%s', (s, n) => {
    expect(parsePrice(s as string)).toBe(n);
  });
});

// ── 1. datos estructurados publicados por el sitio ─────────────────────────
describe('JSON-LD', () => {
  it('lee @graph, resuelve @id y tolera JSON con comas sobrantes', () => {
    const e = extractJsonLd(dom(PRODUCT_GRAPH));
    const product = e.filter((x) => x.type === 'Product');
    expect(product).toHaveLength(2);
    expect(product[0]!.data).toMatchObject({ name: 'Zapatilla Run', sku: 'RUN-1', brand: { name: 'Acme' }, offers: { price: '259.90' } });
    expect(product[1]!.data).toMatchObject({ name: 'Roto' }); // se reparó la coma final
    expect(e.find((x) => x.type === 'Organization')!.noise).toBe(true);
    expect(e.find((x) => x.type === 'BreadcrumbList')!.noise).toBe(true);
    expect(product[0]!.data).not.toHaveProperty('@context');
  });
  it('expande ItemList en entidades', () => {
    const e = extractJsonLd(dom(ITEMLIST));
    expect(e.map((x) => x.type)).toEqual(['Product', 'Product']);
    expect(e.every((x) => !x.noise)).toBe(true);
  });
});

describe('Microdata y RDFa', () => {
  it('microdata anidado (Product → Offer)', () => {
    const [p] = extractMicrodata(dom(MICRODATA), 'https://t.test/');
    expect(p!.type).toBe('Product');
    expect(p!.data).toMatchObject({ name: 'Mochila', image: 'https://t.test/m.jpg', offers: { type: 'Offer', price: '49.5', priceCurrency: 'USD' } });
  });
  it('RDFa-lite', () => {
    const [p] = extractMicrodata(dom(RDFA), 'https://t.test/');
    expect(p).toMatchObject({ type: 'Product', data: { name: 'Taza', sku: 'T-1' } });
  });
});

describe('robots, sitemap y feeds', () => {
  const robots = 'User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /admin\nAllow: /admin/public\nCrawl-delay: 2\nSitemap: https://t.test/sm.xml';
  it('robots.txt', () => {
    const r = parseRobots(robots, 'https://t.test');
    expect(r).toMatchObject({ sitemaps: ['https://t.test/sm.xml'], disallow: ['/admin'], allow: ['/admin/public'], crawlDelay: 2 });
    expect(isAllowed(r, '/admin/x')).toBe(false);
    expect(isAllowed(r, '/admin/public/x')).toBe(true);
    expect(isAllowed(r, '/otra')).toBe(true);
  });
  it('sitemap e índice', () => {
    expect(parseSitemap('<sitemapindex><sitemap><loc>https://t.test/a.xml</loc></sitemap></sitemapindex>').kind).toBe('index');
    expect(parseSitemap('<urlset><url><loc>https://t.test/1?a=1&amp;b=2</loc></url><url><loc><![CDATA[https://t.test/2]]></loc></url></urlset>').locs).toEqual(['https://t.test/1?a=1&b=2', 'https://t.test/2']);
  });
  it('RSS y Atom', () => {
    const rss = parseFeed('<rss><channel><item><title>Uno</title><link>https://t.test/1</link><pubDate>Mon, 01 Oct 2026</pubDate><description>&lt;b&gt;Hola&lt;/b&gt; mundo</description></item></channel></rss>');
    expect(rss[0]).toMatchObject({ titulo: 'Uno', enlace: 'https://t.test/1' });
    const atom = parseFeed('<feed><entry><title>Dos</title><link href="https://t.test/2"/><updated>2026-10-02</updated></entry></feed>');
    expect(atom[0]).toMatchObject({ titulo: 'Dos', enlace: 'https://t.test/2', fecha: '2026-10-02' });
  });
  it('discoverSite sigue robots → índice → sitemaps y respeta el tope', async () => {
    const files: Record<string, string> = {
      'https://t.test/robots.txt': 'Sitemap: https://t.test/index.xml',
      'https://t.test/index.xml': '<sitemapindex><sitemap><loc>https://t.test/a.xml</loc></sitemap><sitemap><loc>https://t.test/b.xml.gz</loc></sitemap></sitemapindex>',
      'https://t.test/a.xml': '<urlset>' + Array.from({ length: 10 }, (_, i) => `<url><loc>https://t.test/${i}</loc></url>`).join('') + '</urlset>',
    };
    const f = async (u: string) => files[u] ?? null;
    const full = await discoverSite('https://t.test', f);
    expect(full.urls).toHaveLength(10);
    expect(full.errors.some((e) => e.includes('.gz'))).toBe(true);
    const cut = await discoverSite('https://t.test', f, { maxUrls: 4 });
    expect(cut.urls).toHaveLength(4);
    expect(cut.truncated).toBe(true);
  });
});

// ── 3. patrones repetidos en el DOM ─────────────────────────────────────────
describe('listas repetidas y tablas', () => {
  const a = analyzeDom(dom(LISTING), URL_);
  const repeats = a.results.find((r) => r.strategy === 'repeats')!;

  it('detecta las 8 tarjetas aunque las clases sean hash (sc-aB3dE) y no confunde el menú', () => {
    const best = repeats.lists[0]!;
    expect(best.rows).toHaveLength(8);
    expect(best.score).toBeGreaterThanOrEqual(0.45);
    const menu = repeats.lists.find((l) => l.rows.some((r) => Object.values(r).includes('Ofertas')));
    if (menu) expect(menu.score).toBeLessThan(0.45);
  });
  it('infiere columnas con nombre útil y URLs absolutas', () => {
    const row = repeats.lists[0]!.rows[0]!;
    expect(Object.keys(row)).toEqual(expect.arrayContaining(['titulo', 'precio', 'enlace', 'imagen']));
    expect(row.titulo).toBe('Zapatilla modelo 1');
    expect(row.precio).toBe('S/ 100.90');
    expect(String(row.enlace)).toBe('https://tienda.test/p/1');
    expect(String(row.imagen)).toBe('https://tienda.test/img/1.jpg');
  });
  it('el spec devuelto reproduce las mismas filas sobre el DOM (sirve para guardar como regla)', () => {
    const l = repeats.lists[0]!;
    const rule: SiteRule = { id: 't', name: 'T', match: { host: 'tienda.test' }, list: l.spec! };
    const res = applyRule(rule, dom(LISTING), URL_, [], {});
    expect(res.lists[0]!.rows).toHaveLength(8);
    expect(res.lists[0]!.rows[2]!.titulo).toBe('Zapatilla modelo 3');
  });
  it('tablas con encabezado', () => {
    const t = analyzeDom(dom(TABLE), 'https://x.test/').results.find((r) => r.strategy === 'repeats')!;
    expect(t.lists[0]!.rows).toHaveLength(4);
    expect(t.lists[0]!.rows[0]).toEqual({ 'País': 'Perú', Capital: 'Lima', 'Población': '33' });
  });
});

// ── 4. heurísticas ─────────────────────────────────────────────────────────
describe('heurísticas', () => {
  it('artículo: título, autor, fecha y texto', () => {
    const r = analyzeDom(dom(ARTICLE), 'https://d.test/n/1').results.find((x) => x.strategy === 'heuristics')!;
    const art = r.entities.find((e) => e.type === 'Article')!;
    expect(art.data).toMatchObject({ title: 'Titular de la nota', author: 'Ana Pérez' });
    expect(String(art.data.text).length).toBeGreaterThan(400);
  });
  it('contacto y redes quedan como contexto (noise), no como dato principal', () => {
    const r = analyzeDom(dom(LISTING), URL_).results.find((x) => x.strategy === 'heuristics')!;
    const c = r.entities.find((e) => e.type === 'Contact')!;
    expect(c.noise).toBe(true);
    expect(c.data).toMatchObject({ emails: ['ventas@tienda.test'], phones: ['+51999888777'] });
    expect(useful(r)).toBe(false);
  });
  it('en un listado no inventa un Product con un precio cualquiera', () => {
    const r = analyzeDom(dom(LISTING), URL_).results.find((x) => x.strategy === 'heuristics')!;
    expect(r.entities.some((e) => e.type === 'Product')).toBe(false);
  });
});

// ── la cascada ─────────────────────────────────────────────────────────────
describe('cascada', () => {
  it('ficha de producto: gana JSON-LD (lo más fiable)', () => {
    const c = cascade(analyzeDom(dom(PRODUCT_GRAPH), 'https://t.test/p/1'));
    expect(c.winner?.strategy).toBe('jsonld');
    expect(toTables(c.winner!)[0]!.name).toBe('Product');
  });
  it('un Organization suelto no detiene la cascada: se cae a la lista repetida', () => {
    const c = cascade(analyzeDom(dom(ORG_ONLY_PLUS_CARDS), URL_));
    expect(c.tried.find((t) => t.strategy === 'jsonld')!.useful).toBe(false);
    expect(c.winner?.strategy).toBe('repeats');
    expect(toTables(c.winner!)[0]!.rows).toHaveLength(8);
  });
  it('página sin datos estructurados: gana la lista repetida', () => {
    expect(cascade(analyzeDom(dom(LISTING), URL_)).winner?.strategy).toBe('repeats');
  });
  it('microdata, artículo y tabla', () => {
    expect(cascade(analyzeDom(dom(MICRODATA), 'https://t.test/')).winner?.strategy).toBe('microdata');
    expect(cascade(analyzeDom(dom(ARTICLE), 'https://d.test/n/1')).winner?.strategy).toBe('opengraph');
    expect(cascade(analyzeDom(dom(TABLE), 'https://x.test/')).winner?.strategy).toBe('repeats');
  });
  it('sin nada útil: no hay ganador (aquí entraría la IA)', () => {
    const c = cascade(analyzeDom(dom('<html><body><p>Hola</p></body></html>'), 'https://v.test/'));
    expect(c.winner).toBeUndefined();
  });
  it('los datos que vienen de fuera (APIs internas) entran en el orden: embedded va antes que repeats', () => {
    const extra = [{ strategy: 'embedded' as const, entities: [], lists: [{ source: 'embedded' as const, name: 'api', rows: [{ a: 1 }], score: 0.9 }] }];
    expect(cascade(analyzeDom(dom(LISTING), URL_), extra).winner?.strategy).toBe('embedded');
  });
});

// ── reglas por sitio (datos, no código) ────────────────────────────────────
describe('reglas por sitio', () => {
  const rule: SiteRule = {
    id: 'tienda', name: 'Tienda', match: { host: ['tienda.test'], path: '^/zapatillas' }, status: 'stable', prefer: ['rule'], disable: ['heuristics'],
    entity: { type: 'Product', fields: { name: { css: 'h1' }, brand: { jsonld: 'brand.name' }, price: { css: '.nope', jsonld: 'offers.price', transform: 'number' } } },
  };
  it('coincidencia por host (con subdominios y www) y ruta', () => {
    expect(matchRule([rule], 'https://www.tienda.test/zapatillas?x=1')).toBe(rule);
    expect(matchRule([rule], 'https://m.tienda.test/zapatillas')).toBe(rule);
    expect(matchRule([rule], 'https://tienda.test/otra')).toBeUndefined();
    expect(matchRule([rule], 'https://otra.test/zapatillas')).toBeUndefined();
  });
  it('orden propio y estrategias desactivadas', () => {
    const o = orderFor(rule);
    expect(o[0]).toBe('rule');
    expect(o).not.toContain('heuristics');
  });
  it('un campo prueba css → jsonld → meta, y transforma', () => {
    const html = PRODUCT_GRAPH.replace('<body>', '<body>');
    const a = analyzeDom(dom(html), 'https://tienda.test/zapatillas', [rule]);
    const r = a.results.find((x) => x.strategy === 'rule')!;
    expect(r.entities[0]!.data).toEqual({ name: 'Zapatilla Run', brand: 'Acme', price: 259.9 });
    expect(a.results.some((x) => x.strategy === 'heuristics')).toBe(false);
    expect(cascade(a, [], rule).winner?.strategy).toBe('rule');
  });
  it('"unsupported" no intenta nada y deja la nota', () => {
    const bad: SiteRule = { id: 'x', name: 'X', match: { host: 'tienda.test' }, status: 'unsupported', note: 'Exige login' };
    const a = analyzeDom(dom(LISTING), URL_, [bad]);
    expect(a.results.some((r) => r.strategy === 'rule')).toBe(false);
    expect(a.ruleNote).toBe('Exige login');
    expect(a.ruleStatus).toBe('unsupported');
  });
  it('validateRule detecta reglas rotas', () => {
    expect(validateRule({ id: 'a', match: { host: 'x.com' } })).toEqual([]);
    expect(validateRule({ match: {} }).length).toBeGreaterThan(0);
    expect(validateRule({ id: 'a', match: { host: 'x.com', path: '(' } })).toEqual(['"match.path" no es una expresión regular válida']);
  });
});

// ── IA (último recurso) ────────────────────────────────────────────────────
describe('IA', () => {
  const schema = { nombre: 'string', precio: 'number', stock: 'boolean', fotos: 'string[]' } as const;
  it('cleanHtml quita scripts, estilos y atributos, y respeta el tope', () => {
    const h = cleanHtml(dom('<html><head><style>a{}</style></head><body><nav>menu</nav><script>x()</script><div class="a" onclick="x()"><a href="/p" data-x="1">Hola</a><img src="data:image/png;base64,AAA" alt="f"></div></body></html>'));
    expect(h).toBe('<div><a href="/p">Hola</a><img alt="f"></div>');
    expect(cleanHtml(dom('<html><body>' + '<p>x</p>'.repeat(5000) + '</body></html>'), 100).length).toBe(100);
  });
  it('parseAiJson acepta bloques de código y texto alrededor', () => {
    expect(parseAiJson('Claro:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseAiJson('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(() => parseAiJson('no hay json')).toThrow();
  });
  it('validate corrige lo corregible y marca lo demás sin inventar', () => {
    const v = validate({ nombre: 'Taza', precio: 'S/ 1.299,90', stock: 'sí', fotos: 'a.jpg' }, schema);
    expect(v.value).toEqual({ nombre: 'Taza', precio: 1299.9, stock: true, fotos: ['a.jpg'] });
    const w = validate({ nombre: 'Taza', precio: 'gratis' }, schema);
    expect(w.value).toMatchObject({ precio: null, stock: null });
    expect(w.issues).toEqual(['precio: se esperaba number']);
  });
  it('extractWithAi usa el proveedor inyectado y valida la salida', async () => {
    let seen = '';
    const fake = async (p: string) => { seen = p; return '```json\n[{"nombre":"A","precio":"10","stock":true,"fotos":[]},{"nombre":"B","precio":"x"}]\n```'; };
    const r = await extractWithAi('<div/>', schema, fake, { mode: 'many', url: 'https://t.test/' });
    expect(seen).toContain('array JSON');
    expect(seen).toContain('https://t.test/');
    expect(r.entities.map((e) => e.data.precio)).toEqual([10, null]);
    expect(r.issues).toEqual(['#2 precio: se esperaba number']);
    expect(buildPrompt('<p/>', schema, 'one', '')).toContain('único objeto');
  });
});

// ── paso 2: APIs internas ya capturadas ────────────────────────────────────
import { embeddedFromCaptures } from '@/features/structured/embedded';
import { bundledRules } from '@/sites/rules';
describe('APIs internas', () => {
  const cap = (body: unknown, extra: object = {}) => ({ id: '1', tabId: 1, kind: 'fetch', url: 'https://t.test/api/items?page=1', pageUrl: '', method: 'GET', status: 200, reqHeaders: {}, resType: 'application/json', format: 'json', body: JSON.stringify(body), size: 1, ts: 1, ...extra }) as any;
  it('convierte colecciones JSON capturadas en listas con columnas', () => {
    const r = embeddedFromCaptures([cap({ data: { items: [{ id: 1, name: 'a', price: 5 }, { id: 2, name: 'b', price: 6 }, { id: 3, name: 'c', price: 7 }] } })]);
    expect(r.lists[0]!.rows).toHaveLength(3);
    expect(Object.keys(r.lists[0]!.rows[0]!)).toEqual(expect.arrayContaining(['id', 'name', 'price']));
    expect(useful(r)).toBe(true);
  });
  it('ignora errores HTTP y HTML', () => {
    expect(embeddedFromCaptures([cap({ items: [{ a: 1, b: 2 }, { a: 2, b: 3 }] }, { status: 500 }), cap({}, { format: 'html' })]).lists).toHaveLength(0);
  });
  it('las reglas incluidas ignoran los archivos que empiezan por _ (el ejemplo)', () => {
    expect(bundledRules.every((r) => r.id !== 'tienda-ejemplo')).toBe(true);
  });
});

describe('host de reglas', () => {
  it('ignora el puerto del patrón y coincide con www/subdominios', () => {
    const r: SiteRule = { id: 'p', name: 'P', match: { host: 'localhost:8765' } };
    expect(matchRule([r], 'http://localhost:8765/x')).toBe(r);
    expect(matchRule([{ id: 'q', name: 'Q', match: { host: 'www.tienda.test' } }], 'https://m.tienda.test/')).toBeDefined();
  });
});
