import type { Format } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function detectGraphQL(url: string, reqBody: string | undefined, parsed: unknown): string | undefined | false {
  let op: string | undefined;
  let hit = false;
  if (reqBody) {
    try {
      const rb = JSON.parse(reqBody);
      const first = Array.isArray(rb) ? rb[0] : rb;
      if (isObj(first) && (typeof first.query === 'string' || 'operationName' in first || 'persistedQuery' in (first.extensions as object ?? {}))) {
        hit = true;
        op = typeof first.operationName === 'string' ? first.operationName : undefined;
        if (!op && typeof first.query === 'string') op = /(?:query|mutation|subscription)\s+(\w+)/.exec(first.query)?.[1];
      }
    } catch { /* body no JSON */ }
  }
  if (!hit && /graphql|\/gql\b/i.test(url) && isObj(parsed) && ('data' in parsed || 'errors' in parsed)) hit = true;
  return hit ? op : false;
}

export function classify(body: string, contentType = '', url = '', reqBody?: string): { format: Format; operation?: string } {
  const t = body.trimStart();
  const c = t[0];
  if (c === '{' || c === '[') {
    try {
      const parsed = JSON.parse(t);
      const gql = detectGraphQL(url, reqBody, parsed);
      if (gql !== false) return { format: 'graphql', operation: gql };
      return { format: 'json' };
    } catch { /* continúa */ }
  }
  if (c === '<') {
    if (/^<!doctype html|^<html|<body[\s>]/i.test(t.slice(0, 2000)) || /html/i.test(contentType)) return { format: 'html' };
    if (/xml/i.test(contentType) || t.startsWith('<?xml') || /^<[A-Za-z][\w:.-]*[\s>]/.test(t)) return { format: 'xml' };
  }
  return { format: 'text' };
}
