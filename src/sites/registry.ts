import type { SiteAdapter, SitePreset } from './types';
import generic from './generic';

// Carga automática de /sites/<id>/index.ts (excepto generic y _template).
const mods = import.meta.glob<{ default: SiteAdapter }>(['./*/index.ts', '!./generic/index.ts', '!./_template/index.ts'], { eager: true });
export const adapters: SiteAdapter[] = Object.values(mods).map((m) => m.default);

export function findAdapter(pageUrl: string): SiteAdapter {
  return adapters.find((a) => { try { return a.match(pageUrl); } catch { return false; } }) ?? generic;
}
export function findPreset(pageUrl: string, captureUrl: string): SitePreset | undefined {
  return findAdapter(pageUrl).presets?.find((p) => captureUrl.includes(p.urlIncludes));
}
