import { installHook } from '@/features/capture/hook';

export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installHook();
  },
});
