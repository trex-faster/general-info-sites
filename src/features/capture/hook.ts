// Corre en el mundo MAIN de la página: envuelve fetch / XHR / WebSocket y lee datos embebidos.
/** Corre en el mundo MAIN de la página: envuelve fetch / XHR / WebSocket y lee datos embebidos. */
export function installHook(): void {
    const w = window as any;
    if (w.__scrapeLensHooked) return;
    w.__scrapeLensHooked = true;

    const EV = '__scrape_lens__';
    const CMD = '__scrape_lens_cmd__';
    const MAX = 2_000_000;
    const off = () => !!document.documentElement?.hasAttribute('data-sl-off');
    const emit = (c: Record<string, unknown>) => {
      try {
        window.dispatchEvent(new CustomEvent(EV, { detail: JSON.stringify({ pageUrl: location.href, ts: Date.now(), ...c }) }));
      } catch { /* nunca romper la página */ }
    };
    const wanted = (ct: string) =>
      /json|xml|graphql/i.test(ct) ? true : /javascript|css|font|image|video|audio|octet|wasm|pdf|zip/i.test(ct) ? false : true;
    const abs = (u: string) => { try { return new URL(u, location.href).href; } catch { return u; } };
    const hdrs = (h: any): Record<string, string> => {
      const o: Record<string, string> = {};
      try {
        if (!h) return o;
        if (h instanceof Headers) h.forEach((v, k) => (o[k] = v));
        else if (Array.isArray(h)) h.forEach(([k, v]) => (o[k] = v));
        else Object.entries(h).forEach(([k, v]) => (o[k] = String(v)));
      } catch { /* ignorar */ }
      return o;
    };
    const ser = (b: any): string | undefined => {
      if (b == null) return undefined;
      if (typeof b === 'string') return b.slice(0, MAX);
      if (b instanceof URLSearchParams) return b.toString();
      if (b instanceof FormData) {
        const o: Record<string, unknown> = {};
        b.forEach((v, k) => (o[k] = typeof v === 'string' ? v : `[file:${(v as File).name}]`));
        return JSON.stringify(o);
      }
      return undefined; // binario: solo metadatos
    };

    // ---- fetch ----
    const origFetch = w.fetch;
    w.fetch = function (this: unknown, input: any, init?: any) {
      const p = origFetch.apply(this, arguments as any);
      if (off()) return p;
      let meta: { url: string; method: string; headers: Record<string, string>; body: Promise<string | undefined> } | undefined;
      try {
        const isReq = typeof Request !== 'undefined' && input instanceof Request;
        const method = String(init?.method ?? (isReq ? input.method : 'GET')).toUpperCase();
        let body: Promise<string | undefined> = Promise.resolve(ser(init?.body));
        // clonar ANTES de que fetch consuma el cuerpo de un Request
        if (isReq && init?.body == null && method !== 'GET' && method !== 'HEAD') body = input.clone().text().catch(() => undefined);
        meta = { url: abs(isReq ? input.url : String(input)), method, headers: { ...(isReq ? hdrs(input.headers) : {}), ...hdrs(init?.headers) }, body };
      } catch { /* ignorar */ }
      p.then((res: Response) => {
        try {
          if (!meta) return;
          const ct = res.headers.get('content-type') || '';
          if (!wanted(ct)) return;
          const m = meta;
          res.clone().text().then(async (text) =>
            emit({ kind: 'fetch', url: m.url, method: m.method, status: res.status, reqHeaders: m.headers, reqBody: await m.body, resType: ct, body: text.slice(0, MAX), truncated: text.length > MAX }),
          ).catch(() => {});
        } catch { /* ignorar */ }
      }).catch(() => {}); // la promesa original se devuelve intacta: los rechazos siguen su curso normal
      return p;
    };

    // ---- XHR ----
    const XO = XMLHttpRequest.prototype;
    const meta = new WeakMap<XMLHttpRequest, { method: string; url: string; headers: Record<string, string>; body?: string }>();
    const oOpen = XO.open, oSend = XO.send, oSet = XO.setRequestHeader;
    XO.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
      try { meta.set(this, { method: method.toUpperCase(), url: abs(String(url)), headers: {} }); } catch { /* */ }
      return (oOpen as any).call(this, method, url, ...rest);
    } as any;
    XO.setRequestHeader = function (this: XMLHttpRequest, k: string, v: string) {
      try { const m = meta.get(this); if (m) m.headers[k] = v; } catch { /* */ }
      return oSet.call(this, k, v);
    };
    XO.send = function (this: XMLHttpRequest, body?: any) {
      try {
        const m = meta.get(this);
        if (m && !off()) {
          m.body = ser(body);
          this.addEventListener('loadend', () => {
            try {
              const ct = this.getResponseHeader('content-type') || '';
              if (!wanted(ct)) return;
              const rt = this.responseType;
              const text = rt === '' || rt === 'text' ? this.responseText : rt === 'json' ? JSON.stringify(this.response) : undefined;
              if (typeof text === 'string') emit({ kind: 'xhr', url: m.url, method: m.method, status: this.status, reqHeaders: m.headers, reqBody: m.body, resType: ct, body: text.slice(0, MAX), truncated: text.length > MAX });
            } catch { /* */ }
          });
        }
      } catch { /* */ }
      return oSend.call(this, body);
    };

    // ---- WebSocket (mensajes entrantes con forma de JSON/XML) ----
    try {
      const WS = w.WebSocket;
      w.WebSocket = new Proxy(WS, {
        construct(target, args, nt) {
          const ws = Reflect.construct(target, args, nt) as WebSocket;
          try {
            ws.addEventListener('message', (e) => {
              if (off() || typeof e.data !== 'string' || !/^\s*[{[<]/.test(e.data)) return;
              emit({ kind: 'ws', url: ws.url, method: 'WS', status: 101, reqHeaders: {}, resType: 'ws', body: e.data.slice(0, MAX) });
            });
          } catch { /* */ }
          return ws;
        },
      });
    } catch { /* */ }

    // ---- datos embebidos / estado global ----
    const GLOBALS = ['__NEXT_DATA__', '__NUXT__', '__INITIAL_STATE__', '__PRELOADED_STATE__', '__APOLLO_STATE__', '__REDUX_STATE__', '__DATA__', 'ytInitialData'];
    const safe = (v: unknown) => {
      const seen = new WeakSet();
      try {
        return JSON.stringify(v, (_k, x) => {
          if (typeof x === 'function') return undefined;
          if (x && typeof x === 'object') { if (seen.has(x)) return undefined; seen.add(x); }
          return x;
        })?.slice(0, MAX);
      } catch { return undefined; }
    };
    const scan = () => {
      if (off()) return;
      document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]').forEach((s, i) => {
        const t = s.textContent;
        if (t && t.length > 2) emit({ kind: 'embedded', url: `${location.href}#${s.id || s.getAttribute('type')}-${i}`, method: 'GET', status: 200, reqHeaders: {}, resType: 'application/json', body: t.slice(0, MAX) });
      });
      for (const g of GLOBALS) {
        try {
          const v = w[g];
          const s = v != null ? safe(v) : undefined;
          if (s && s.length > 2) emit({ kind: 'embedded', url: `${location.href}#window.${g}`, method: 'GET', status: 200, reqHeaders: {}, resType: 'application/json', body: s });
        } catch { /* */ }
      }
    };
    window.addEventListener(CMD, (e) => { if ((e as CustomEvent).detail === 'scan') scan(); });
    window.addEventListener('load', () => setTimeout(scan, 800));
}
