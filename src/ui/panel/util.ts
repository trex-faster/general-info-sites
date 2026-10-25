import { useEffect, useState } from 'react';
import type { BgRequest, TabRequest } from '@/core/types';

export const bg = <T,>(m: BgRequest) => browser.runtime.sendMessage(m) as Promise<T>;
export const tabMsg = <T,>(tabId: number, m: TabRequest) => browser.tabs.sendMessage(tabId, m) as Promise<T>;

export function useActiveTab(): { tabId: number | null; url: string } {
  const [s, set] = useState<{ tabId: number | null; url: string }>({ tabId: null, url: '' });
  useEffect(() => {
    const refresh = async () => {
      const [t] = await browser.tabs.query({ active: true, currentWindow: true });
      set({ tabId: t?.id ?? null, url: t?.url ?? '' });
    };
    refresh();
    browser.tabs.onActivated.addListener(refresh);
    browser.tabs.onUpdated.addListener(refresh);
    return () => { browser.tabs.onActivated.removeListener(refresh); browser.tabs.onUpdated.removeListener(refresh); };
  }, []);
  return s;
}

export function download(name: string, text: string, mime: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const hostOf = (u: string) => { try { return new URL(u).host; } catch { return ''; } };
export const short = (u: string, n = 70) => { try { const x = new URL(u); const s = x.pathname + x.search + x.hash; return s.length > n ? s.slice(0, n) + '…' : s; } catch { return u.slice(0, n); } };
