import type { Engine } from '../types';
import { classify } from './classify';
import { appendKey, findCandidates, queryPath, resolveCollection } from './path';
import { buildRows, suggestColumns, toCSV } from './rows';

export const jsEngine: Engine = { name: 'js', classify, queryPath, resolveCollection, findCandidates, appendKey, suggestColumns, buildRows, toCSV };
export { flatten } from './rows';
