import type { Capture } from './types';
import { parseXml } from './xml';

export function parseBody(c: Pick<Capture, 'format' | 'body'>): unknown {
  try {
    if (c.format === 'xml') return parseXml(c.body);
    if (c.format === 'json' || c.format === 'graphql' || c.format === 'text') return JSON.parse(c.body);
  } catch { /* sin datos estructurados */ }
  return null;
}
