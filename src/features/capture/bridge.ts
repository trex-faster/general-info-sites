import { MAX_BODY, SENSITIVE_HEADERS, type Kind, type TabRequest } from '@/core/types';
import { extractDom } from '@/features/extract/dom';

const EV = '__scrape_lens__';
const CMD = '__scrape_lens_cmd__';
const KINDS: Kind[] = ['fetch', 'xhr', 'ws', 'embedded'];

/** Mundo aislado: valida lo que emite el hook y atiende órdenes del panel (scan, replay, dom-extract). */
export function installBridge(): void {
    const setEnabled = (on: boolean) => {
      const root = document.documentElement;
      if (!root) return;
      if (on) root.removeAttribute('data-sl-off'); else root.setAttribute('data-sl-off', '');
    };
    browser.storage.local.get('enabled').then((r) => setEnabled(r.enabled !== false)).catch(() => {});
    browser.storage.onChanged.addListener((ch) => { if (ch.enabled) setEnabled(ch.enabled.newValue !== false); });

    // La página puede disparar este evento: validamos y saneamos todo antes de reenviarlo.
    window.addEventListener(EV, (e) => {
      try {
        const d = JSON.parse((e as CustomEvent).detail);
        if (!d || typeof d.url !== 'string' || typeof d.body !== 'string' || !KINDS.includes(d.kind)) return;
        const headers: Record<string, string> = {};
        if (d.reqHeaders && typeof d.reqHeaders === 'object')
          for (const [k, v] of Object.entries(d.reqHeaders)) if (!SENSITIVE_HEADERS.test(k) && typeof v === 'string') headers[k.toLowerCase()] = v.slice(0, 2000);
        browser.runtime.sendMessage({
          type: 'capture',
          capture: {
            kind: d.kind, url: d.url.slice(0, 4000), pageUrl: String(d.pageUrl ?? '').slice(0, 4000),
            method: String(d.method ?? 'GET').toUpperCase().slice(0, 10), status: Number(d.status) || 0,
            reqHeaders: headers, reqBody: typeof d.reqBody === 'string' ? d.reqBody.slice(0, MAX_BODY) : undefined,
            resType: String(d.resType ?? '').slice(0, 200), body: d.body.slice(0, MAX_BODY),
            truncated: !!d.truncated, ts: Number(d.ts) || Date.now(),
          },
        }).catch(() => {});
      } catch { /* ignorar */ }
    });

    browser.runtime.onMessage.addListener((msg: TabRequest, _s, sendResponse) => {
      if (!msg || typeof msg !== 'object') return false;
      if (msg.type === 'scan') {
        window.dispatchEvent(new CustomEvent(CMD, { detail: 'scan' }));
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'dom-extract') {
        try { sendResponse({ ok: true, rows: extractDom(document, msg.spec) }); }
        catch (err) { sendResponse({ ok: false, error: String(err) }); }
        return false;
      }
      if (msg.type === 'replay') {
        const { url, method, headers, body } = msg.req;
        fetch(url, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : body, credentials: 'include' })
          .then(async (r) => sendResponse({ ok: true, status: r.status, resType: r.headers.get('content-type') || '', body: (await r.text()).slice(0, MAX_BODY) }))
          .catch((err) => sendResponse({ ok: false, error: String(err) }));
        return true;
      }
      return false;
    });
}
