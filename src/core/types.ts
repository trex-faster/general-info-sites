export type Format = 'json' | 'graphql' | 'xml' | 'html' | 'text';
export type Kind = 'fetch' | 'xhr' | 'ws' | 'embedded';

export interface Capture {
  id: string;
  tabId: number;
  kind: Kind;
  url: string;
  pageUrl: string;
  method: string;
  status: number;
  reqHeaders: Record<string, string>;
  reqBody?: string;
  resType: string;
  format: Format;
  operation?: string;
  body: string;
  size: number;
  truncated?: boolean;
  ts: number;
}
export type CaptureMeta = Omit<Capture, 'body'>;

export interface Column { name: string; key: string }
export interface Recipe {
  id: string;
  name: string;
  host: string;
  urlIncludes: string;
  path: string;
  columns: Column[];
}

export interface ReplayCfg {
  mode: 'query' | 'body' | 'cursor';
  name: string;       // parámetro de query o ruta en el body (p. ej. variables.page)
  from: number;
  to: number;
  step: number;
  delay: number;
  nextPath: string;   // modo cursor: ruta en la respuesta con el siguiente cursor
  maxPages: number;
}
export interface ReplayReq { url: string; method: string; headers: Record<string, string>; body?: string }

export interface DomSpec { rowSelector: string; columns: { name: string; selector: string; attr?: string }[] }

export type BgRequest =
  | { type: 'capture'; capture: Omit<Capture, 'id' | 'tabId' | 'format' | 'operation' | 'size'> }
  | { type: 'list'; tabId: number; q?: string; format?: Format | ''; kind?: Kind | '' }
  | { type: 'get'; id: string }
  | { type: 'clear'; tabId: number };
export type TabRequest =
  | { type: 'scan' }
  | { type: 'replay'; req: ReplayReq }
  | { type: 'dom-extract'; spec: DomSpec };

export const MAX_BODY = 2_000_000;
export const SENSITIVE_HEADERS = /^(authorization|cookie|proxy-authorization|set-cookie)$/i;
