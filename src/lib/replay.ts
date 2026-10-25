import type { Capture, ReplayCfg, ReplayReq } from './types';
import { SENSITIVE_HEADERS } from './types';

export function setByPath(obj: any, path: string, value: unknown): void {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) cur[k] = value;
    else { if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = /^\d+$/.test(keys[i + 1] ?? '') ? [] : {}; cur = cur[k]; }
  });
}

export function buildReplayRequest(cap: Pick<Capture, 'url' | 'method' | 'reqHeaders' | 'reqBody'>, cfg: ReplayCfg, value: string | number): ReplayReq {
  const headers = Object.fromEntries(Object.entries(cap.reqHeaders).filter(([k]) => !SENSITIVE_HEADERS.test(k)));
  let url = cap.url;
  let body = cap.reqBody;
  if (cfg.mode === 'query') {
    const u = new URL(url);
    u.searchParams.set(cfg.name, String(value));
    url = u.href;
  } else if (body) {
    try {
      const j = JSON.parse(body);
      const target = Array.isArray(j) ? j[0] : j;
      setByPath(target, cfg.name, typeof value === 'number' || /^\d+$/.test(String(value)) ? Number(value) : value);
      body = JSON.stringify(j);
    } catch {
      const p = new URLSearchParams(body); // body x-www-form-urlencoded
      p.set(cfg.name, String(value));
      body = p.toString();
    }
  }
  return { url, method: cap.method === 'WS' ? 'GET' : cap.method, headers, body };
}

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
export function toCurl(cap: Pick<Capture, 'url' | 'method' | 'reqHeaders' | 'reqBody'>): string {
  const parts = [`curl ${q(cap.url)}`];
  if (cap.method !== 'GET') parts.push(`-X ${cap.method}`);
  for (const [k, v] of Object.entries(cap.reqHeaders)) if (!SENSITIVE_HEADERS.test(k)) parts.push(`-H ${q(`${k}: ${v}`)}`);
  if (cap.reqBody) parts.push(`--data-raw ${q(cap.reqBody)}`);
  return parts.join(' \\\n  ');
}
