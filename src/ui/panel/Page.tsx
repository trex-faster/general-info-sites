import { useEffect, useMemo, useState } from 'react';
import type { Capture, CaptureMeta } from '@/core/types';
import { engine, type Row } from '@/engines';
import { bundledRules } from '@/sites/rules';
import { cascade, toTables, type Table } from '@/features/structured/analyze';
import { embeddedFromCaptures } from '@/features/structured/embedded';
import { discoverSite, isAllowed, parseFeed, type SiteMap } from '@/features/structured/feeds';
import { extractWithAi, openAiCompatible, type AiSchema } from '@/features/structured/ai';
import { matchRule } from '@/features/structured/rules';
import { LIST_MIN_SCORE } from '@/features/structured/repeats';
import { deleteUserRule, getAiSettings, getUserRules, importRules, saveAiSettings, saveUserRule, type AiSettings } from '@/features/structured/store';
import type { AnalyzeResponse, CleanHtmlResponse } from '@/features/structured/messages';
import type { ListResult, PageAnalysis, RuleStatus, SiteRule, StrategyId, StrategyResult } from '@/features/structured/types';
import { bg, download, hostOf, tabMsg } from './util';

const LABEL: Record<StrategyId, string> = {
  rule: 'Regla del sitio', jsonld: 'JSON-LD', microdata: 'Microdata / RDFa', opengraph: 'OpenGraph',
  embedded: 'APIs internas', repeats: 'Patrones del DOM', heuristics: 'Heurísticas', ai: 'IA',
};

interface Block { name: string; rows: Row[]; list?: ListResult }

function Preview({ rows }: { rows: Row[] }) {
  const cols = [...new Set(rows.slice(0, 20).flatMap((r) => Object.keys(r)))].slice(0, 10);
  return (
    <div className="tablewrap">
      <table>
        <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.slice(0, 8).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} title={String(r[c] ?? '')}>{String(r[c] ?? '')}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

async function fetchText(u: string): Promise<string | null> {
  try { const r = await fetch(u); return r.ok ? await r.text() : null; } catch { return null; }
}

export function Page({ tabId, url }: { tabId: number; url: string }) {
  const host = (() => { try { return new URL(url).hostname; } catch { return hostOf(url); } })(); // sin puerto: así lo compara matchRule
  const [analysis, setAnalysis] = useState<PageAnalysis | null>(null);
  const [extra, setExtra] = useState<StrategyResult[]>([]);
  const [sel, setSel] = useState<StrategyId | null>(null);
  const [noise, setNoise] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [userRules, setUserRules] = useState<SiteRule[]>([]);
  const [site, setSite] = useState<SiteMap | null>(null);
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [schemaText, setSchemaText] = useState('');
  const [importText, setImportText] = useState('');

  const allRules = useMemo(() => [...userRules, ...bundledRules], [userRules]);
  const rule = useMemo(() => matchRule(allRules, url), [allRules, url]);
  const reload = () => getUserRules().then(setUserRules);

  useEffect(() => { reload(); getAiSettings().then((s) => { setAi(s); setSchemaText(JSON.stringify(s.schema, null, 2)); }); }, []);
  useEffect(() => { setAnalysis(null); setExtra([]); setSel(null); setSite(null); setMsg(''); }, [tabId, url]);

  async function analyze() {
    setBusy(true); setMsg('');
    try {
      const rules = [...(await getUserRules()), ...bundledRules];
      const r = await tabMsg<AnalyzeResponse>(tabId, { type: 'analyze', rules });
      if (!r || !r.ok) { setMsg(r && !r.ok ? 'Error: ' + r.error : 'Recarga la pestaña para activar el análisis'); setBusy(false); return; }
      // Paso 2 de la cascada: APIs internas ya capturadas
      const metas = (await bg<CaptureMeta[]>({ type: 'list', tabId })) ?? [];
      const top = metas.filter((m) => m.format !== 'html' && m.status < 400).sort((a, b) => b.size - a.size).slice(0, 12);
      const caps = (await Promise.all(top.map((m) => bg<Capture>({ type: 'get', id: m.id })))).filter(Boolean) as Capture[];
      setAnalysis(r.analysis);
      setExtra((prev) => [embeddedFromCaptures(caps), ...prev.filter((p) => p.strategy === 'ai')]);
      setSel(null);
    } catch (e) { setMsg('Error: ' + (e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  }

  const casc = useMemo(() => (analysis ? cascade(analysis, extra, rule) : null), [analysis, extra, rule]);
  const current = sel ?? casc?.winner?.strategy ?? null;
  const result = analysis && current ? [...analysis.results, ...extra].find((r) => r.strategy === current) : undefined;

  const blocks: Block[] = useMemo(() => {
    if (!result) return [];
    const ents: Block[] = toTables({ ...result, lists: [] }, noise).map((t: Table) => ({ name: t.name, rows: t.rows }));
    const lists: Block[] = result.lists
      .filter((l) => noise || l.score >= LIST_MIN_SCORE || result.strategy === 'rule')
      .map((l) => ({ name: `${l.name}${l.score < LIST_MIN_SCORE ? ' · confianza baja' : ''}`, rows: l.rows, list: l }));
    return [...ents, ...lists];
  }, [result, noise]);

  const fname = (n: string) => `scrape-lens-${host}-${n.replace(/[^\w-]+/g, '_').slice(0, 30)}-${Date.now()}`;

  async function saveAsRule(l: ListResult) {
    if (!l.spec) return;
    const r: SiteRule = { id: `${host}-${Date.now().toString(36)}`, name: host, match: { host }, status: 'experimental', prefer: ['rule'], list: l.spec };
    await saveUserRule(r); await reload();
    setMsg('Regla guardada para ' + host + '. La próxima vez se aplicará primero (pestaña Reglas para editarla o marcarla).');
  }

  async function discover() {
    setBusy(true); setMsg('');
    try { setSite(await discoverSite(new URL(url).origin, fetchText)); } catch (e) { setMsg('Error: ' + String(e)); }
    setBusy(false);
  }

  async function readFeed(u: string) {
    const txt = await fetchText(u);
    if (!txt) { setMsg('No se pudo leer el feed'); return; }
    const rows = parseFeed(txt);
    download(fname('feed') + '.csv', engine.toCSV(rows), 'text/csv;charset=utf-8');
    setMsg(`Feed: ${rows.length} entradas descargadas`);
  }

  async function runAi() {
    if (!ai) return;
    setBusy(true); setMsg('');
    try {
      let schema: AiSchema;
      try { schema = JSON.parse(schemaText); } catch { throw new Error('El esquema no es JSON válido'); }
      if (!ai.key || !ai.model) throw new Error('Completa endpoint, clave y modelo');
      await saveAiSettings({ ...ai, schema });
      const c = await tabMsg<CleanHtmlResponse>(tabId, { type: 'clean-html' });
      if (!c?.ok) throw new Error(c && !c.ok ? c.error : 'Recarga la pestaña');
      const out = await extractWithAi(c.html, schema, openAiCompatible(ai), { mode: ai.mode, url });
      setExtra((prev) => [...prev.filter((p) => p.strategy !== 'ai'), { strategy: 'ai', entities: out.entities, lists: [] }]);
      setSel('ai');
      setMsg(`IA: ${out.entities.length} resultado(s)${out.issues.length ? ' · avisos: ' + out.issues.slice(0, 3).join('; ') : ''}`);
      if (!analysis) await analyze();
    } catch (e) { setMsg('Error: ' + (e instanceof Error ? e.message : String(e))); }
    setBusy(false);
  }

  const setStatus = async (r: SiteRule, status: RuleStatus) => { await saveUserRule({ ...r, status }); await reload(); };
  const doImport = async () => { const r = await importRules(importText); await reload(); setMsg(`Reglas importadas: ${r.saved}${r.errors.length ? ' · ' + r.errors.join(' | ') : ''}`); if (r.saved) setImportText(''); };
  const path = (() => { try { return new URL(url).pathname; } catch { return '/'; } })();

  return (
    <div>
      <div className="bar">
        <button className="act" disabled={busy} onClick={analyze}>{busy ? 'Analizando…' : 'Analizar página'}</button>
        <button disabled={busy} onClick={discover}>Mapear sitio</button>
        <label style={{ margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={noise} onChange={(e) => setNoise(e.target.checked)} /> incluir contexto</label>
      </div>
      {msg && <div className="msg">{msg}</div>}
      {rule && <div className={'msg ' + (rule.status === 'unsupported' ? 'bad' : '')}>Regla «{rule.name}» · {rule.status ?? 'experimental'}{rule.note ? ' · ' + rule.note : ''}</div>}
      {!analysis && !site && <p className="muted">«Analizar página» prueba, en este orden: regla del sitio → JSON-LD → microdata/RDFa → OpenGraph → APIs internas capturadas → patrones repetidos del DOM → heurísticas, y se queda con el primero que dé datos. Los demás quedan disponibles para comparar.</p>}

      {analysis && casc && (
        <section>
          <div className="msg"><b>{analysis.meta.title || host}</b>{analysis.meta.type ? ` · ${analysis.meta.type}` : ''}{analysis.meta.lang ? ` · ${analysis.meta.lang}` : ''}
            {analysis.meta.description && <div className="muted">{analysis.meta.description.slice(0, 160)}</div>}</div>
          <div className="bar chips">
            {casc.tried.map((t) => (
              <button key={t.strategy} className={t.strategy === current ? 'act' : ''} onClick={() => setSel(t.strategy)} title={t.error ?? ''}>
                {t.useful ? '✓ ' : ''}{LABEL[t.strategy]} · {t.entities + t.lists}{t.strategy === casc.winner?.strategy ? ' ★' : ''}
              </button>
            ))}
          </div>
          {!casc.winner && <p className="muted">Ningún método encontró datos. Prueba la IA (abajo) o crea una regla para este sitio.</p>}
          {casc.winner && <p className="muted">★ = método elegido por la cascada. Pulsa otro para verlo.</p>}
          {blocks.map((b, i) => (
            <div key={i} className="blk">
              <div className="bar">
                <b>{b.name}</b><span className="muted">{b.rows.length} filas</span>
                <button onClick={() => download(fname(b.name) + '.csv', engine.toCSV(b.rows), 'text/csv;charset=utf-8')}>CSV</button>
                <button onClick={() => download(fname(b.name) + '.json', JSON.stringify(b.rows, null, 2), 'application/json')}>JSON</button>
                {b.list?.spec && <button onClick={() => saveAsRule(b.list!)}>Guardar como regla</button>}
              </div>
              <Preview rows={b.rows} />
            </div>
          ))}
          {result && blocks.length === 0 && <p className="muted">Este método solo encontró contexto; activa «incluir contexto» para verlo.</p>}
          {analysis.feeds.length > 0 && (
            <details><summary>Feeds ({analysis.feeds.length})</summary>
              {analysis.feeds.map((f) => <div key={f} className="bar"><span className="url">{f}</span><button onClick={() => readFeed(f)}>CSV</button></div>)}
            </details>
          )}
        </section>
      )}

      {site && (
        <section>
          <div className="msg"><b>{site.origin}</b> · {site.urls.length} URLs{site.truncated ? ' (tope alcanzado)' : ''} · {site.sitemaps.length} sitemap(s)
            {site.robots && <div className="muted">robots.txt: {site.robots.disallow.length} rutas bloqueadas{site.robots.crawlDelay ? ` · espera ${site.robots.crawlDelay}s` : ''} · esta página {isAllowed(site.robots, path) ? 'permitida' : 'NO permitida'}</div>}
            {!site.robots && <div className="muted">Sin robots.txt accesible.</div>}
            {site.errors.map((e, i) => <div key={i} className="muted">{e}</div>)}</div>
          <div className="bar">
            <button disabled={!site.urls.length} onClick={() => download(fname('urls') + '.csv', engine.toCSV(site.urls.map((u) => ({ url: u })), ['url']), 'text/csv;charset=utf-8')}>URLs CSV</button>
            <button disabled={!site.urls.length} onClick={() => download(fname('urls') + '.txt', site.urls.join('\n'), 'text/plain')}>URLs TXT</button>
          </div>
          {site.urls.length > 0 && <div className="tree">{site.urls.slice(0, 40).map((u) => <div key={u} className="url">{u}</div>)}{site.urls.length > 40 && <div className="muted">… y {site.urls.length - 40} más (la exportación incluye todo)</div>}</div>}
        </section>
      )}

      <details>
        <summary>Reglas de {host || 'este sitio'} ({allRules.filter((r) => matchRule([r], url)).length}) · datos, no código</summary>
        <p className="muted">Una regla es un JSON (selectores y rutas). Las tuyas se guardan aquí y pisan a las incluidas en <code>src/sites/rules</code>. Marca como «unsupported» los sitios que no vas a soportar.</p>
        <ul className="caps">
          {userRules.filter((r) => matchRule([r], url)).map((r) => (
            <li key={r.id} style={{ cursor: 'default' }}>
              <b>{r.name}</b> <span className="muted">{r.id}</span>
              <div className="bar">
                <select style={{ width: 'auto' }} value={r.status ?? 'experimental'} onChange={(e) => setStatus(r, e.target.value as RuleStatus)}>
                  <option>experimental</option><option>stable</option><option>unsupported</option>
                </select>
                <button onClick={() => download(r.id + '.json', JSON.stringify(r, null, 2), 'application/json')}>Exportar</button>
                <button onClick={async () => { await deleteUserRule(r.id); await reload(); }}>Borrar</button>
              </div>
            </li>
          ))}
        </ul>
        {bundledRules.filter((r) => matchRule([r], url)).map((r) => <div key={r.id} className="muted">Incluida: {r.name} ({r.status ?? 'experimental'})</div>)}
        <label>Importar regla(s) JSON<textarea rows={5} value={importText} placeholder='{"id":"mi-sitio","name":"Mi sitio","match":{"host":"ejemplo.com"},"list":{…}}' onChange={(e) => setImportText(e.target.value)} /></label>
        <div className="bar">
          <button disabled={!importText.trim()} onClick={doImport}>Importar</button>
          <button disabled={!userRules.length} onClick={() => download('scrape-lens-reglas.json', JSON.stringify(userRules, null, 2), 'application/json')}>Exportar todas</button>
        </div>
      </details>

      {ai && (
        <details>
          <summary>IA (último recurso)</summary>
          <p className="muted">Envía el HTML limpio de la página al proveedor que indiques (API compatible con /chat/completions) y valida la respuesta contra tu esquema. La clave se guarda solo en este navegador. El contenido de la página sale de tu equipo hacia ese proveedor y cuesta dinero por página.</p>
          <label>Endpoint<input value={ai.endpoint} onChange={(e) => setAi({ ...ai, endpoint: e.target.value })} /></label>
          <div className="grid3">
            <label>Modelo<input value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} /></label>
            <label>Clave<input type="password" value={ai.key} onChange={(e) => setAi({ ...ai, key: e.target.value })} /></label>
            <label>Salida<select value={ai.mode} onChange={(e) => setAi({ ...ai, mode: e.target.value as 'one' | 'many' })}><option value="one">1 objeto</option><option value="many">lista</option></select></label>
          </div>
          <label>Esquema (campo → string | number | boolean | string[] | number[])<textarea rows={5} value={schemaText} onChange={(e) => setSchemaText(e.target.value)} /></label>
          <button disabled={busy} onClick={runAi}>Extraer con IA</button>
        </details>
      )}
    </div>
  );
}
