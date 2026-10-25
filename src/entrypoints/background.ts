import { engine } from '@/engines';
import { clearTab, getCapture, listCaptures, putCapture } from '@/core/storage/captures';
import { newId } from '@/core/hash';
import type { BgRequest, Capture } from '@/core/types';

export default defineBackground(() => {
  if (browser.sidePanel?.setPanelBehavior) {
    browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  } else if ((browser as any).sidebarAction) {
    browser.action.onClicked.addListener(() => (browser as any).sidebarAction.toggle());
  }

  const counts = new Map<number, number>();
  const badge = (tabId: number) => {
    browser.action.setBadgeText({ tabId, text: String(counts.get(tabId) || '') }).catch(() => {});
  };

  async function handle(msg: BgRequest, tabId?: number): Promise<unknown> {
    switch (msg.type) {
      case 'capture': {
        if (tabId == null || tabId < 0) return;
        const c = msg.capture;
        const { format, operation } = c.kind === 'embedded' ? { format: 'json' as const, operation: undefined } : engine.classify(c.body, c.resType, c.url, c.reqBody);
        if (format === 'html' && c.kind !== 'fetch' && c.kind !== 'xhr') return;
        const cap: Capture = { ...c, id: newId(tabId, c.kind, c.url), tabId, format, operation, size: c.body.length };
        await putCapture(cap);
        counts.set(tabId, (counts.get(tabId) ?? 0) + 1);
        badge(tabId);
        return;
      }
      case 'list': return listCaptures(msg.tabId, msg);
      case 'get': return getCapture(msg.id);
      case 'clear': counts.delete(msg.tabId); badge(msg.tabId); return clearTab(msg.tabId);
    }
  }

  browser.runtime.onMessage.addListener((msg: BgRequest, sender, sendResponse) => {
    if (!msg || !['capture', 'list', 'get', 'clear'].includes(msg.type)) return false;
    handle(msg, sender.tab?.id).then(sendResponse).catch((e) => sendResponse({ error: String(e) }));
    return true;
  });

  browser.tabs.onRemoved.addListener((id) => { counts.delete(id); clearTab(id).catch(() => {}); });
});
