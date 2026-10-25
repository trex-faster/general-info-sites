import type { Engine } from '../types';

/**
 * Punto de enchufe para un motor en Rust/Go compilado a WASM (ver /crates).
 * Devuelve null mientras no exista el binario: el motor JS sigue activo sin cambios.
 * Para activarlo: compilar a public/wasm/engine.wasm, implementar aquí el wrapper que cumpla `Engine`
 * (idealmente sólo los métodos calientes: findCandidates/buildRows/toCSV) y devolverlo.
 */
export async function loadWasmEngine(): Promise<Partial<Engine> | null> {
  return null;
}
