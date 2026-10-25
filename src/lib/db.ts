import type { Capture, CaptureMeta, Format, Kind } from './types';

const MAX_PER_TAB = 300;
let dbp: Promise<IDBDatabase> | null = null;
const open = () => (dbp ??= new Promise((res, rej) => {
  const r = indexedDB.open('scrape-lens', 1);
  r.onupgradeneeded = () => {
    const s = r.result.createObjectStore('captures', { keyPath: 'id' });
    s.createIndex('tab', 'tabId');
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));
const done = (t: IDBTransaction) => new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function putCapture(c: Capture): Promise<void> {
  const db = await open();
  const t = db.transaction('captures', 'readwrite');
  t.objectStore('captures').put(c);
  await done(t);
  await trim(c.tabId);
}

async function trim(tabId: number): Promise<void> {
  const db = await open();
  const t = db.transaction('captures', 'readwrite');
  const idx = t.objectStore('captures').index('tab');
  const total = await req(idx.count(tabId));
  if (total > MAX_PER_TAB + 20) {
    let toDelete = total - MAX_PER_TAB;
    const all: { id: string; ts: number }[] = [];
    await new Promise<void>((res) => {
      const cur = idx.openKeyCursor(IDBKeyRange.only(tabId));
      cur.onsuccess = () => { const c = cur.result; if (c) { all.push({ id: c.primaryKey as string, ts: 0 }); c.continue(); } else res(); };
    });
    // los ids no son ordenables por tiempo en general: leemos ts por lectura puntual
    const store = t.objectStore('captures');
    for (const a of all) a.ts = (await req(store.get(a.id)) as Capture | undefined)?.ts ?? 0;
    all.sort((x, y) => x.ts - y.ts);
    for (const a of all) { if (toDelete-- <= 0) break; store.delete(a.id); }
  }
  await done(t);
}

export async function listCaptures(tabId: number, f: { q?: string; format?: Format | ''; kind?: Kind | '' } = {}): Promise<CaptureMeta[]> {
  const db = await open();
  const out: CaptureMeta[] = [];
  const q = f.q?.trim().toLowerCase();
  await new Promise<void>((res, rej) => {
    const cur = db.transaction('captures').objectStore('captures').index('tab').openCursor(IDBKeyRange.only(tabId));
    cur.onerror = () => rej(cur.error);
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return res();
      const v = c.value as Capture;
      if ((!f.format || v.format === f.format) && (!f.kind || v.kind === f.kind) &&
        (!q || v.url.toLowerCase().includes(q) || (v.operation ?? '').toLowerCase().includes(q) || v.body.toLowerCase().includes(q))) {
        const { body: _b, ...meta } = v;
        out.push(meta);
      }
      c.continue();
    };
  });
  return out.sort((a, b) => b.ts - a.ts);
}

export async function getCapture(id: string): Promise<Capture | undefined> {
  const db = await open();
  return req(db.transaction('captures').objectStore('captures').get(id));
}

export async function clearTab(tabId: number): Promise<void> {
  const db = await open();
  const t = db.transaction('captures', 'readwrite');
  const idx = t.objectStore('captures').index('tab');
  await new Promise<void>((res) => {
    const cur = idx.openKeyCursor(IDBKeyRange.only(tabId));
    cur.onsuccess = () => { const c = cur.result; if (c) { t.objectStore('captures').delete(c.primaryKey); c.continue(); } else res(); };
  });
  await done(t);
}
