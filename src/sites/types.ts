import type { Column, ReplayCfg } from '@/core/types';

/** Receta incorporada: ruta + columnas ya conocidas para un endpoint de ese sitio. */
export interface SitePreset {
  name: string;
  urlIncludes: string;      // fragmento de la URL de la captura
  path: string;             // colección
  columns?: Column[];       // si se omite, se sugieren automáticamente
  replay?: Partial<ReplayCfg>;
}

/**
 * Un adaptador de sitio es SOLO una carpeta en /sites/<id>/index.ts que exporta `default` de este tipo.
 * Se registra solo (import.meta.glob): añadir un sitio no obliga a editar ningún otro archivo.
 */
export interface SiteAdapter {
  id: string;
  name: string;
  match(pageUrl: string): boolean;
  presets?: SitePreset[];
  /** Normaliza los datos antes de buscar colecciones (desenvolver sobres, unir entidades, etc.). */
  transform?(data: unknown, ctx: { url: string; operation?: string }): unknown;
}
