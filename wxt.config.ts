import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => {
    const isFirefox = browser === 'firefox';
    return {
      name: 'Scrape Lens',
      description:
        'Captura fetch/XHR/GraphQL/REST/XML/WebSocket de cualquier sitio y conviértelo en tablas exportables.',
      permissions: ['storage', 'unlimitedStorage', ...(isFirefox ? [] : ['sidePanel'])] as never[],
      host_permissions: ['<all_urls>'],
      action: { default_title: 'Scrape Lens' },
      ...(isFirefox
        ? { browser_specific_settings: { gecko: { id: 'scrape-lens@local.dev', strict_min_version: '128.0' } } }
        : {}),
    };
  },
});
