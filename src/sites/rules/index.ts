import type { SiteRule } from '@/features/structured/types';

/**
 * Reglas incluidas: cada sitio es un archivo JSON en esta carpeta (sin código).
 * Añadir un sitio = copiar `_ejemplo.json`, renombrarlo y cambiar selectores. Los archivos que empiezan por "_" se ignoran.
 */
const files = import.meta.glob<SiteRule>(['./*.json', '!./_*.json'], { eager: true, import: 'default' });
export const bundledRules: SiteRule[] = Object.values(files);
