import { useEffect, useMemo, useRef, useState } from 'react';
import type { Capture, Column, DomSpec, Recipe, ReplayCfg } from '@/core/types';
import { engine, type Row } from '@/engines';
import { findPreset } from '@/sites/registry';
import { saveRecipe as storeRecipe } from '@/features/recipes/store';
import { extractDom, parseDomColumns } from '@/features/extract/dom';
import { parseBody } from '@/features/extract/parse';
import { buildReplayRequest } from '@/features/replay/replay';
import { download, hostOf, sleep, tabMsg } from './util';

interface Props { cap: Capture; tabId: number; presetPath?: string; recipe?: Recipe | null }
type ReplayRes = { ok: boolean; status?: number; body?: string; resType?: string; error?: string };

const DEF_CFG: ReplayCfg = { mode: 'query', name: 'page', from: 1, to: 5, step: 1, delay: 400, nextPath: '', maxPages: 100 };

export function Extractor({ cap, tabId, presetPath, recipe }: Props) {
  const isHtml = cap.format === 'html';
  const data = useMemo(() => (isHtml ? null : parseBody(cap)), [cap, isHtml]);
  const cands = useMemo(() => (data ? engine.findCandidates(data) : []), [data]);
  const [path, setPath] = useState('');
  const [cols, setCols] = useState<Column[]>([]);
  const [extra, setExtra] = useState<Row[] | null>(null); // filas acumuladas por replay
  const [msg, setMsg] = useState('');
  const [cfg, setCfg] = useState<ReplayCfg>(DEF_CFG);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);
  // HTML
  const [rowSel, setRowSel] = useState('tr');
  const [domCols, setDomCols] = useState('titulo=a\nenlace=a@href');

  useEffect(() => {
    setExtra(null); setMsg('');
    if (isHtml || !data) return;
    const preset = findPreset(cap.pageUrl, cap.url);
    const p = presetPath ?? (recipe && cap.url.includes(recipe.urlIncludes) ? recipe.path : preset?.path ?? cands[0]?.path ?? '');
    setPath(p);
    setCols(recipe && cap.url.includes(recipe.urlIncludes) ? recipe.columns : !presetPath && preset?.columns ? preset.columns : engine.suggestColumns(engine.resolveCollection(data, p)));
    if (preset?.replay) setCfg((c) => ({ ...c, ...preset.replay }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cap.id, presetPath, recipe]);

  const items = useMemo(() => { try { return data ? engine.resolveCollection(data, path) : []; } catch { return []; } }, [data, path]);
  const htmlRows = useMemo<Row[]>(() => {
    if (!isHtml) return [];
    try { return extractDom(new DOMParser().parseFromString(cap.body, 'text/html'), { rowSelector: rowSel, columns: parseDomColumns(domCols) }); } catch { return []; }
  }, [isHtml, cap.body, rowSel, domCols]);
  const rows = useMemo(() => (isHtml ? htmlRows : engine.buildRows(items, cols)), [isHtml, htmlRows, items, cols]);
  const shown = extra ?? rows;
  const colNames = isHtml ? parseDomColumns(domCols).map((c) => c.name) : cols.map((c) => c.name);

  const changePath = (p: string) => { setPath(p); if (data) setCols(engine.suggestColumns(engine.resolveCollection(data, p))); setExtra(null); };
  const updCol = (i: number, patch: Partial<Column>) => setCols(cols.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  async function runReplay() {
    setRunning(true); stop.current = false; setMsg('');
    const all: Row[] = [];
    try {
      let value: string | number = cfg.from;
      for (let n = 0; n < Math.min(cfg.maxPages, 500); n++) {
        if (stop.current) break;
        if (cfg.mode !== 'cursor' && (value as number) > cfg.to) break;
        const req = buildReplayRequest(cap, cfg, value);
        const res = await tabMsg<ReplayRes>(tabId, { type: 'replay', req });
        if (!res?.ok) throw new Error(res?.error ?? 'Sin respuesta de la página (recárgala)');
        const { format } = engine.classify(res.body ?? '', res.resType ?? '', req.url, req.body);
        const parsed = parseBody({ format, body: res.body ?? '' });
        const list = parsed ? engine.resolveCollection(parsed, path) : [];
        if (!list.length) { setMsg(`Página ${value}: sin resultados (HTTP ${res.status}). Fin.`); break; }
        all.push(...engine.buildRows(list, cols));
        setExtra([...all]);
        setMsg(`Página ${value} → ${all.length} filas`);
        if (cfg.mode === 'cursor') {
          const nx = engine.queryPath(parsed, cfg.nextPath)[0];
          if (nx == null || nx === '' || nx === false) { setMsg(`Terminado: ${all.length} filas (sin más cursores).`); break; }
          value = String(nx);
        } else value = (value as number) + (cfg.step || 1);
        await sleep(cfg.delay);
      }
    } catch (e) { setMsg('Error: ' + (e instanceof Error ? e.message : String(e))); }
    setRunning(false);
  }

  async function liveDom() {
    const spec: DomSpec = { rowSelector: rowSel, columns: parseDomColumns(domCols) };
    const r = await tabMsg<{ ok: boolean; rows?: Row[]; error?: string }>(tabId, { type: 'dom-extract', spec });
    if (r?.ok) { setExtra(r.rows ?? []); setMsg(`DOM en vivo: ${r.rows?.length ?? 0} filas`); } else setMsg(r?.error ?? 'Error');
  }

  async function saveRecipe() {
    const name = prompt('Nombre de la receta', hostOf(cap.url)); if (!name) return;
    const r: Recipe = { id: Date.now().toString(36), name, host: hostOf(cap.pageUrl || cap.url), urlIncludes: (() => { try { return new URL(cap.url).pathname; } catch { return cap.url; } })(), path, columns: cols };
    await storeRecipe(r);
    setMsg('Receta guardada');
  }

  const fname = `scrape-lens-${hostOf(cap.url)}-${Date.now()}`;
  return (
    <div className="extractor">
      {isHtml ? (
        <>
          <label>Selector de fila<input value={rowSel} onChange={(e) => setRowSel(e.target.value)} /></label>
          <label>Columnas (nombre=selector@atributo)<textarea rows={4} value={domCols} onChange={(e) => setDomCols(e.target.value)} /></label>
          <button onClick={liveDom}>Extraer del DOM en vivo</button>
        </>
      ) : (
        <>
          <label>Colección
            <select value={cands.some((c) => c.path === path) ? path : '__custom'} onChange={(e) => e.target.value !== '__custom' && changePath(e.target.value)}>
              {cands.map((c) => <option key={c.path} value={c.path}>{(c.path || '(raíz)') + ` · ${c.count} ítems${c.map ? ' · mapa' : ''}`}</option>)}
              <option value="__custom">personalizada…</option>
            </select>
          </label>
          <label>Ruta<input value={path} placeholder="data.items" onChange={(e) => changePath(e.target.value)} /></label>
          <details>
            <summary>Columnas ({cols.length})</summary>
            {cols.map((c, i) => (
              <div className="colrow" key={i}>
                <input value={c.name} onChange={(e) => updCol(i, { name: e.target.value })} />
                <input value={c.key} title="clave aplanada o ruta relativa" onChange={(e) => updCol(i, { key: e.target.value })} />
                <button onClick={() => setCols(cols.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button onClick={() => setCols([...cols, { name: 'nueva', key: '' }])}>+ columna</button>
          </details>
          <details>
            <summary>Paginar con replay</summary>
            <p className="muted">Repite esta petición desde la página (con tus cookies) cambiando un parámetro.</p>
            <label>Modo
              <select value={cfg.mode} onChange={(e) => setCfg({ ...cfg, mode: e.target.value as ReplayCfg['mode'] })}>
                <option value="query">Parámetro en la URL</option>
                <option value="body">Campo del body JSON (p. ej. variables.page)</option>
                <option value="cursor">Cursor (siguiente en la respuesta)</option>
              </select>
            </label>
            <label>{cfg.mode === 'body' ? 'Ruta del campo' : 'Nombre del parámetro'}<input value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} /></label>
            {cfg.mode === 'cursor' ? (
              <>
                <label>Ruta del siguiente cursor<input value={cfg.nextPath} placeholder="data.pageInfo.endCursor" onChange={(e) => setCfg({ ...cfg, nextPath: e.target.value })} /></label>
                <label>Máx. páginas<input type="number" value={cfg.maxPages} onChange={(e) => setCfg({ ...cfg, maxPages: +e.target.value })} /></label>
              </>
            ) : (
              <div className="grid3">
                <label>Desde<input type="number" value={cfg.from} onChange={(e) => setCfg({ ...cfg, from: +e.target.value })} /></label>
                <label>Hasta<input type="number" value={cfg.to} onChange={(e) => setCfg({ ...cfg, to: +e.target.value })} /></label>
                <label>Paso<input type="number" value={cfg.step} onChange={(e) => setCfg({ ...cfg, step: +e.target.value })} /></label>
              </div>
            )}
            <label>Pausa entre páginas (ms)<input type="number" value={cfg.delay} onChange={(e) => setCfg({ ...cfg, delay: +e.target.value })} /></label>
            {running ? <button onClick={() => (stop.current = true)}>Detener</button> : <button onClick={runReplay}>Ejecutar paginación</button>}
          </details>
        </>
      )}
      {msg && <div className="msg">{msg}</div>}
      <div className="bar">
        <b>{shown.length} filas</b>
        <button disabled={!shown.length} onClick={() => download(fname + '.csv', engine.toCSV(shown, colNames), 'text/csv;charset=utf-8')}>CSV</button>
        <button disabled={!shown.length} onClick={() => download(fname + '.json', JSON.stringify(shown, null, 2), 'application/json')}>JSON</button>
        {!isHtml && <button onClick={saveRecipe}>Guardar receta</button>}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr>{colNames.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>{shown.slice(0, 100).map((r, i) => <tr key={i}>{colNames.map((c, j) => <td key={j} title={String(r[c] ?? '')}>{String(r[c] ?? '')}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {shown.length > 100 && <div className="muted">Vista previa: 100 de {shown.length} (la exportación incluye todo)</div>}
    </div>
  );
}
