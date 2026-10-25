import type { Column, Format } from '@/core/types';

export type Cell = string | number | boolean;
export type Row = Record<string, Cell>;
export interface Candidate { path: string; count: number; keys: string[]; map?: boolean; score: number }

/**
 * Contrato del motor de cómputo. Todo lo "pesado y puro" (sin DOM ni APIs del navegador) vive detrás
 * de esta interfaz, así se puede reemplazar por WASM (Rust/Go) o un proceso nativo sin tocar el resto.
 * Regla: entradas y salidas son datos simples serializables (strings, números, objetos JSON).
 */
export interface Engine {
  readonly name: 'js' | 'wasm' | 'native';
  classify(body: string, contentType?: string, url?: string, reqBody?: string): { format: Format; operation?: string };
  queryPath(data: unknown, path: string): unknown[];
  resolveCollection(data: unknown, path: string): unknown[];
  findCandidates(data: unknown, limit?: number): Candidate[];
  appendKey(base: string, key: string | number): string;
  suggestColumns(items: unknown[], max?: number): Column[];
  buildRows(items: unknown[], columns: Column[]): Row[];
  toCSV(rows: Row[], columns?: string[]): string;
}
