import type { Entity } from './types';
import { isObj, parsePrice } from './util';

/**
 * Último recurso de la cascada: un modelo convierte HTML limpio en JSON con TU esquema.
 * El proveedor se inyecta (`Provider`), así el código no depende de ningún servicio concreto.
 * Esquema de ejemplo:  { "nombre": "string", "precio": "number", "stock": "boolean", "fotos": "string[]" }
 */
export type FieldType = 'string' | 'number' | 'boolean' | 'string[]' | 'number[]';
export type AiSchema = Record<string, FieldType>;
export type Provider = (prompt: string) => Promise<string>;

export interface AiConfig { endpoint: string; key: string; model: string }

const DROP = 'script,style,svg,noscript,iframe,link,meta,template,canvas,video,audio,object,embed,head';
const KEEP_ATTRS = new Set(['href', 'src', 'alt', 'title', 'datetime', 'content', 'itemprop', 'value']);

/** HTML reducido para gastar pocos tokens: sin scripts ni estilos, solo atributos útiles, con tope de tamaño. */
export function cleanHtml(doc: Document, maxChars = 40_000): string {
  const root = (doc.body ?? doc.documentElement).cloneNode(true) as Element;
  root.querySelectorAll(DROP).forEach((e) => e.remove());
  root.querySelectorAll('nav, footer, aside, header').forEach((e) => e.remove());
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) if (!KEEP_ATTRS.has(a.name)) el.removeAttribute(a.name);
    const src = el.getAttribute('src');
    if (src?.startsWith('data:')) el.removeAttribute('src');
  }
  const html = root.innerHTML.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  return html.length > maxChars ? html.slice(0, maxChars) : html;
}

export function buildPrompt(html: string, schema: AiSchema, mode: 'one' | 'many', url: string): string {
  const shape = JSON.stringify(schema);
  return [
    'Extrae datos de esta página web y responde SOLO con JSON válido, sin texto adicional ni bloques de código.',
    mode === 'many'
      ? `Devuelve un array JSON con un objeto por elemento repetido de la página (producto, resultado, fila), con esta forma: ${shape}`
      : `Devuelve un único objeto JSON con esta forma: ${shape}`,
    'Reglas: usa null cuando el dato no aparezca en el HTML; no inventes valores; los números sin símbolos de moneda ni separadores de miles; las URLs tal como aparecen.',
    `URL: ${url}`,
    'HTML:',
    html,
  ].join('\n');
}

export function parseAiJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? raw).trim();
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error('La respuesta no contiene JSON');
  const open = body[start];
  const end = body.lastIndexOf(open === '[' ? ']' : '}');
  return JSON.parse(body.slice(start, end + 1));
}

export interface Validated { value: Record<string, unknown>; issues: string[] }

/** Comprueba tipos contra el esquema y corrige lo corregible ("1.299,90" → 1299.9). Nunca inventa datos. */
export function validate(item: unknown, schema: AiSchema): Validated {
  const issues: string[] = [];
  const src = isObj(item) ? item : {};
  const value: Record<string, unknown> = {};
  for (const [k, type] of Object.entries(schema)) {
    let v = src[k];
    if (v == null || v === '') { value[k] = null; continue; }
    const bad = () => { issues.push(`${k}: se esperaba ${type}`); value[k] = null; };
    if (type === 'number') {
      const n = typeof v === 'number' ? v : parsePrice(String(v));
      if (n == null) bad(); else value[k] = n;
    } else if (type === 'boolean') {
      if (typeof v === 'boolean') value[k] = v;
      else if (/^(true|si|sí|yes|1|disponible|in stock)$/i.test(String(v))) value[k] = true;
      else if (/^(false|no|0|agotado|out of stock)$/i.test(String(v))) value[k] = false;
      else bad();
    } else if (type === 'string') {
      if (typeof v === 'object') bad(); else value[k] = String(v);
    } else {
      if (!Array.isArray(v)) v = [v];
      const arr = (v as unknown[]).map((x) => (type === 'number[]' ? (typeof x === 'number' ? x : parsePrice(String(x))) : String(x)));
      if (arr.some((x) => x == null)) bad(); else value[k] = arr;
    }
  }
  return { value, issues };
}

export async function extractWithAi(
  html: string, schema: AiSchema, provider: Provider, opts: { mode?: 'one' | 'many'; url?: string } = {},
): Promise<{ entities: Entity[]; issues: string[] }> {
  const mode = opts.mode ?? 'one';
  const parsed = parseAiJson(await provider(buildPrompt(html, schema, mode, opts.url ?? '')));
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const issues: string[] = [];
  const entities = list.map((it, i) => {
    const v = validate(it, schema);
    v.issues.forEach((m) => issues.push(`#${i + 1} ${m}`));
    return { type: 'AI', source: 'ai' as const, data: v.value };
  });
  return { entities, issues };
}

/** Proveedor para cualquier API compatible con /chat/completions (OpenAI, OpenRouter, servidores locales…). */
export function openAiCompatible(cfg: AiConfig): Provider {
  return async (prompt) => {
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`El proveedor respondió ${res.status}`);
    const j = await res.json();
    const out = j?.choices?.[0]?.message?.content;
    if (typeof out !== 'string') throw new Error('Respuesta del proveedor sin contenido');
    return out;
  };
}
