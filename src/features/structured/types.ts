import type { DomSpec } from '@/core/types';
import type { Row } from '@/engines/types';

/** Cada método de extracción tiene un id; el orden de la cascada es una lista de estos ids. */
export type StrategyId = 'rule' | 'jsonld' | 'microdata' | 'opengraph' | 'embedded' | 'repeats' | 'heuristics' | 'ai';

/** Una "cosa" con tipo (Product, Article, Organization…) y sus propiedades. */
export interface Entity {
  type: string;
  source: StrategyId;
  data: Record<string, unknown>;
  /** Ruido de contexto (migas de pan, buscador del sitio…): se muestra pero no detiene la cascada. */
  noise?: boolean;
}

/** Una colección de filas (lista de productos, tabla…). `spec` permite repetirla sobre el DOM en vivo. */
export interface ListResult {
  source: StrategyId;
  name: string;
  rows: Row[];
  spec?: DomSpec;
  /** 0‑1: confianza de que es contenido real y no navegación/relleno. */
  score: number;
}

export interface StrategyResult {
  strategy: StrategyId;
  entities: Entity[];
  lists: ListResult[];
  error?: string;
}

export type PageMeta = Record<string, string>;

/** Lo que devuelve el análisis de una página (todo serializable, viaja por mensajes). */
export interface PageAnalysis {
  url: string;
  meta: PageMeta;
  feeds: string[];
  results: StrategyResult[];
  /** Aviso de una regla del sitio (p. ej. "sin soporte: requiere login"). */
  ruleNote?: string;
  ruleStatus?: RuleStatus;
}

export type RuleStatus = 'experimental' | 'stable' | 'unsupported';

/** Cómo sacar un campo: primera fuente que dé valor. */
export interface FieldSpec {
  css?: string;
  attr?: string;
  /** Propiedad de la primera entidad JSON-LD/microdata, p. ej. "offers.price". */
  jsonld?: string;
  meta?: string;
  regex?: string;
  transform?: 'number' | 'trim' | 'url';
  all?: boolean;
}

/**
 * Regla por sitio: DATOS, no código. Se guarda como JSON en `src/sites/rules/*.json`
 * o en el almacenamiento del usuario (importable/exportable desde el panel).
 */
export interface SiteRule {
  id: string;
  name: string;
  match: { host: string | string[]; path?: string };
  status?: RuleStatus;
  note?: string;
  /** Orden propio de la cascada para este sitio. */
  prefer?: StrategyId[];
  /** Estrategias que en este sitio dan basura. */
  disable?: StrategyId[];
  /** Una lista repetida (productos, resultados…). */
  list?: DomSpec;
  /** Una entidad única (ficha de producto, artículo…). */
  entity?: { type: string; fields: Record<string, FieldSpec> };
}
