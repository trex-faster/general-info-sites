// Copia esta carpeta como /sites/<mi-sitio>/ y ajusta. No se carga mientras se llame _template.
import type { SiteAdapter } from '../types';

const adapter: SiteAdapter = {
  id: 'mi-sitio',
  name: 'Mi sitio',
  match: (pageUrl) => new URL(pageUrl).hostname.endsWith('ejemplo.com'),
  presets: [
    {
      name: 'Listado',
      urlIncludes: '/api/items',
      path: 'data.items',
      columns: [{ name: 'id', key: 'id' }, { name: 'titulo', key: 'title' }],
      replay: { mode: 'query', name: 'page', from: 1, to: 10 },
    },
  ],
};
export default adapter;
