export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
export function newId(tabId: number, kind: string, url: string): string {
  // Los datos embebidos usan id determinista (un re-escaneo los sobrescribe);
  // el resto lleva tabId + tiempo + aleatorio para no colisionar entre pestañas.
  if (kind === 'embedded') return `${tabId}-e-${hash(url)}`;
  return `${tabId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
