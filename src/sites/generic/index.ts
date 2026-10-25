import type { SiteAdapter } from '../types';

/** Comportamiento por defecto: detección automática, sin presets. */
const generic: SiteAdapter = { id: 'generic', name: 'Genérico', match: () => true };
export default generic;
