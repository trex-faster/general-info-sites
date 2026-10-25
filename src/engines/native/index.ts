import type { Engine } from '../types';

/**
 * Punto de enchufe para un binario nativo (Rust/Go) vía Native Messaging (ver /native).
 * Útil para volúmenes grandes (cientos de MB), exportaciones pesadas o integraciones con disco/BD local.
 * Devuelve null mientras no esté instalado el host nativo.
 */
export async function loadNativeEngine(): Promise<Partial<Engine> | null> {
  return null;
}
