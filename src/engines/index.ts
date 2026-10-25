import type { Engine } from './types';
import { jsEngine } from './js';
import { loadWasmEngine } from './wasm';
import { loadNativeEngine } from './native';

export type { Engine, Row, Cell, Candidate } from './types';

/**
 * Fachada única del motor. El resto del código llama `engine.x(...)` y nunca importa una implementación.
 * `initEngine()` sobrescribe sólo los métodos que el motor WASM/nativo implemente (el resto sigue en JS).
 */
export const engine: Engine = { ...jsEngine };

let started = false;
export async function initEngine(): Promise<void> {
  if (started) return;
  started = true;
  for (const load of [loadWasmEngine, loadNativeEngine]) {
    try { const e = await load(); if (e) Object.assign(engine, e); } catch { /* sigue con JS */ }
  }
}
