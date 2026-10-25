import type { SiteRule } from './types';
import { validateRule } from './rules';
import type { AiConfig, AiSchema } from './ai';

/** Reglas del usuario (tienen prioridad sobre las incluidas en `sites/rules`). */
export async function getUserRules(): Promise<SiteRule[]> {
  return ((await browser.storage.local.get('siteRules')).siteRules as SiteRule[] | undefined) ?? [];
}
export async function saveUserRule(rule: SiteRule): Promise<SiteRule[]> {
  const next = [rule, ...(await getUserRules()).filter((r) => r.id !== rule.id)];
  await browser.storage.local.set({ siteRules: next });
  return next;
}
export async function deleteUserRule(id: string): Promise<SiteRule[]> {
  const next = (await getUserRules()).filter((r) => r.id !== id);
  await browser.storage.local.set({ siteRules: next });
  return next;
}

/** Importa una regla o un array de reglas (JSON). Devuelve las reglas guardadas y los errores por regla. */
export async function importRules(json: string): Promise<{ saved: number; errors: string[] }> {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return { saved: 0, errors: ['JSON inválido'] }; }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const errors: string[] = [];
  let saved = 0;
  for (const [i, r] of list.entries()) {
    const errs = validateRule(r);
    if (errs.length) { errors.push(`Regla ${i + 1}: ${errs.join('; ')}`); continue; }
    await saveUserRule(r as SiteRule);
    saved++;
  }
  return { saved, errors };
}

export interface AiSettings extends AiConfig { schema: AiSchema; mode: 'one' | 'many' }
export const DEFAULT_AI: AiSettings = {
  endpoint: 'https://api.openai.com/v1/chat/completions', key: '', model: '',
  schema: { nombre: 'string', precio: 'number', descripcion: 'string', imagen: 'string' }, mode: 'one',
};
export async function getAiSettings(): Promise<AiSettings> {
  return { ...DEFAULT_AI, ...(((await browser.storage.local.get('aiSettings')).aiSettings as Partial<AiSettings> | undefined) ?? {}) };
}
export async function saveAiSettings(s: AiSettings): Promise<void> {
  await browser.storage.local.set({ aiSettings: s });
}
