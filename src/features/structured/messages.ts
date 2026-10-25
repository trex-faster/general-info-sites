import type { PageAnalysis, SiteRule } from './types';

/** Órdenes del panel al content script para el análisis estructurado. */
export type StructuredRequest =
  | { type: 'analyze'; rules: SiteRule[] }
  | { type: 'clean-html' };

export type AnalyzeResponse = { ok: true; analysis: PageAnalysis } | { ok: false; error: string };
export type CleanHtmlResponse = { ok: true; html: string } | { ok: false; error: string };
