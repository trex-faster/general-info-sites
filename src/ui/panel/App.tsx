import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Capture, CaptureMeta, Format, Kind, Recipe } from '@/core/types';
import { parseBody } from '@/features/extract/parse';
import { deleteRecipe, getRecipes } from '@/features/recipes/store';
import { toCurl } from '@/features/replay/replay';
import { Tree } from './Tree';
import { Extractor } from './Extractor';
import { Page } from './Page';
import { bg, hostOf, short, tabMsg, useActiveTab } from './util';

type View = 'list' | 'detail' | 'extract' | 'recipes' | 'page';

export function App() {
  const { tabId, url } = useActiveTab();
  const [view, setView] = useState<View>('list');
  const [items, setItems] = useState<CaptureMeta[]>([]);
  const [q, setQ] = useState('');
  const [format, setFormat] = useState<Format | ''>('');
  const [kind, setKind] = useState<Kind | ''>('');
  const [cap, setCap] = useState<Capture | null>(null);
  const [picked, setPicked] = useState('');
  const [pickedVal, setPickedVal] = useState<unknown>(undefined);
  const [preset, setPreset] = useState<string | undefined>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [note, setNote] = useState('');

  const refresh = useCallback(async () => {
    if (tabId == null) return;
    const r = await bg<CaptureMeta[]>({ type: 'list', tabId, q, format, kind });
    if (Array.isArray(r)) setItems(r);
  }, [tabId, q, format, kind]);

  useEffect(() => { refresh(); const t = setInterval(refresh, 1500); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { browser.storage.local.get('enabled').then((r) => setEnabled(r.enabled !== false)); getRecipes().then(setRecipes); }, [view]);
  useEffect(() => { setCap(null); setView('list'); }, [tabId]);

  const open = async (id: string) => { const c = await bg<Capture>({ type: 'get', id }); if (c) { setCap(c); setPicked(''); setPickedVal(undefined); setPreset(undefined); setView('detail'); } };
  const data = useMemo(() => (cap ? parseBody(cap) : null), [cap]);
  const toggle = async () => { await browser.storage.local.set({ enabled: !enabled }); setEnabled(!enabled); };
  const scan = async () => { if (tabId != null) { try { await tabMsg(tabId, { type: 'scan' }); setNote('Escaneando datos embebidos…'); setTimeout(() => setNote(''), 1500); } catch { setNote('Recarga la pestaña para activar la captura'); } } };
  const pageHost = hostOf(url);
  const mine = recipes.filter((r) => r.host === pageHost);

  const applyRecipe = async (r: Recipe) => {
    const match = items.find((i) => i.url.includes(r.urlIncludes));
    if (!match) { setNote('No hay una captura que coincida; navega la página para generarla'); return; }
    const c = await bg<Capture>({ type: 'get', id: match.id });
    setCap(c); setRecipe(r); setPreset(undefined); setView('extract');
  };
  const delRecipe = async (id: string) => setRecipes(await deleteRecipe(id));

  if (tabId == null) return <div className="app"><p className="muted">Abre una pestaña web.</p></div>;

  return (
    <div className="app">
      <header>
        <b>🔎 Scrape Lens</b>
        <span className="sp" />
        <button className={enabled ? 'on' : 'offb'} onClick={toggle} title="Pausar/reanudar captura">{enabled ? '● Grabando' : '○ Pausado'}</button>
      </header>
      <nav>
        <button className={view === 'list' ? 'act' : ''} onClick={() => setView('list')}>Capturas ({items.length})</button>
        <button disabled={!cap} className={view === 'detail' ? 'act' : ''} onClick={() => setView('detail')}>Detalle</button>
        <button disabled={!cap} className={view === 'extract' ? 'act' : ''} onClick={() => setView('extract')}>Extraer</button>
        <button className={view === 'page' ? 'act' : ''} onClick={() => setView('page')}>Página</button>
        <button className={view === 'recipes' ? 'act' : ''} onClick={() => setView('recipes')}>Recetas{mine.length ? ` (${mine.length})` : ''}</button>
      </nav>
      {note && <div className="msg">{note}</div>}

      {view === 'list' && (
        <section>
          <div className="filters">
            <input placeholder="Buscar en URL o contenido…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={format} onChange={(e) => setFormat(e.target.value as Format | '')}>
              <option value="">formato</option><option>json</option><option>graphql</option><option>xml</option><option>html</option><option>text</option>
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind | '')}>
              <option value="">origen</option><option>fetch</option><option>xhr</option><option>ws</option><option>embedded</option>
            </select>
          </div>
          <div className="bar">
            <button onClick={scan}>Escanear datos embebidos</button>
            <button onClick={async () => { await bg({ type: 'clear', tabId }); setItems([]); setCap(null); }}>Limpiar</button>
          </div>
          {items.length === 0 && <p className="muted">Sin capturas. Navega o interactúa con la página (scroll, paginación, búsquedas). Si la página ya estaba abierta, recárgala.</p>}
          <ul className="caps">
            {items.map((c) => (
              <li key={c.id} onClick={() => open(c.id)}>
                <div><span className={'tag ' + c.format}>{c.operation ? 'gql' : c.format}</span><span className="tag k">{c.kind}</span><b>{c.method}</b> <span className={c.status >= 400 ? 'bad' : 'ok'}>{c.status}</span><span className="muted"> {(c.size / 1024).toFixed(1)} KB</span></div>
                <div className="url" title={c.url}>{c.operation ? `${c.operation} · ` : ''}{short(c.url)}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === 'detail' && cap && (
        <section>
          <div className="url" title={cap.url}>{cap.method} {cap.url}</div>
          <div className="bar">
            <button onClick={() => navigator.clipboard.writeText(toCurl(cap))}>Copiar cURL</button>
            <button onClick={() => navigator.clipboard.writeText(cap.body)}>Copiar cuerpo</button>
            <button onClick={() => setView('extract')}>Extraer →</button>
          </div>
          {picked !== '' && (
            <div className="msg">
              <code>{picked}</code>{' '}
              <button onClick={() => navigator.clipboard.writeText(picked)}>copiar ruta</button>
              {Array.isArray(pickedVal) && <button onClick={() => { setPreset(picked); setRecipe(null); setView('extract'); }}>usar como colección</button>}
            </div>
          )}
          {data != null
            ? <div className="tree"><Tree value={data} path="" selected={picked} onPick={(p, v) => { setPicked(p); setPickedVal(v); }} /></div>
            : <pre className="raw">{cap.body.slice(0, 20000)}</pre>}
          {cap.reqBody && <details><summary>Cuerpo de la petición</summary><pre className="raw">{cap.reqBody.slice(0, 5000)}</pre></details>}
        </section>
      )}

      {view === 'extract' && cap && tabId != null && <section><Extractor cap={cap} tabId={tabId} presetPath={preset} recipe={recipe} /></section>}

      {view === 'page' && <section><Page tabId={tabId} url={url} /></section>}

      {view === 'recipes' && (
        <section>
          <p className="muted">Recetas guardadas para <b>{pageHost || 'este sitio'}</b>. «Aplicar» busca la captura más reciente que coincida y carga su ruta y columnas.</p>
          {mine.length === 0 && <p className="muted">Aún no hay recetas. Guárdalas desde la pestaña «Extraer».</p>}
          <ul className="caps">
            {mine.map((r) => (
              <li key={r.id}><b>{r.name}</b><div className="url">{r.urlIncludes} · {r.path || '(raíz)'} · {r.columns.length} columnas</div>
                <div className="bar"><button onClick={() => applyRecipe(r)}>Aplicar</button><button onClick={() => delRecipe(r.id)}>Borrar</button></div></li>
            ))}
          </ul>
          {recipes.length > mine.length && <p className="muted">{recipes.length - mine.length} receta(s) de otros sitios.</p>}
        </section>
      )}
    </div>
  );
}
