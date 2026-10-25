import { installBridge } from '@/features/capture/bridge';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    installBridge();
  },
});
