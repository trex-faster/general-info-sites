import { classify } from '../src/lib/classify';
import { findCandidates, queryPath, resolveCollection } from '../src/lib/path';
import { buildRows, flatten, parseDomColumns, suggestColumns, toCSV } from '../src/lib/extract';
import { buildReplayRequest, setByPath, toCurl } from '../src/lib/replay';
import { newId } from '../src/lib/hash';

describe('classify', () => {
  it('json / graphql / xml / html / text', () => {
    expect(classify('{"a":1}').format).toBe('json');
    expect(classify('{"data":{"x":1}}', 'application/json', 'https://x.com/graphql').format).toBe('graphql');
    const g = classify('{"data":{}}', '', 'https://x.com/api', JSON.stringify({ query: 'query Feed { a }' }));
    expect(g).toEqual({ format: 'graphql', operation: 'Feed' });
    expect(classify('<?xml version="1.0"?><a/>').format).toBe('xml');
    expect(classify('<!DOCTYPE html><html></html>').format).toBe('html');
    expect(classify('hola').format).toBe('text');
  });
});

describe('path', () => {
  const d = { data: { items: [{ id: 1, n: { a: 'x' } }, { id: 2, n: { a: 'y' } }], map: { u1: { id: 1, t: 'a' }, u2: { id: 2, t: 'b' }, u3: { id: 3, t: 'c' } } } };
  it('query', () => {
    expect(queryPath(d, 'data.items[0].id')).toEqual([1]);
    expect(queryPath(d, 'data.items[*].n.a')).toEqual(['x', 'y']);
    expect(queryPath(d, 'data.items.id')).toEqual([1, 2]);
    expect(queryPath(d, '$.data["items"][1].id')).toEqual([2]);
  });
  it('resolveCollection y mapas por clave', () => {
    expect(resolveCollection(d, 'data.items')).toHaveLength(2);
    expect(resolveCollection(d, 'data.map')[0]).toMatchObject({ _key: 'u1', id: 1 });
  });
  it('findCandidates', () => {
    const c = findCandidates(d);
    expect(c.map((x) => x.path).sort()).toEqual(['data.items', 'data.map']);
    expect(c.find((x) => x.path === 'data.map')?.map).toBe(true);
  });
});

describe('extract', () => {
  it('flatten + columnas + filas', () => {
    expect(flatten({ a: 1, b: { c: [1, 2] }, d: null })).toEqual({ a: 1, 'b.c': '1 | 2', d: '' });
    const items = [{ id: 1, u: { n: 'a' } }, { id: 2, u: { n: 'b' } }];
    const cols = suggestColumns(items);
    expect(buildRows(items, cols)).toEqual([{ id: 1, 'u.n': 'a' }, { id: 2, 'u.n': 'b' }]);
    expect(buildRows(items, [{ name: 'x', key: 'u.n' }])[1]).toEqual({ x: 'b' });
  });
  it('CSV escapa y neutraliza fórmulas', () => {
    const csv = toCSV([{ a: '=1+1', b: 'x,"y"', c: -5 }]);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('"x,""y"""');
    expect(csv).toContain(',-5');
  });
  it('columnas DOM', () => {
    expect(parseDomColumns('t=a\nl=a@href')).toEqual([{ name: 't', selector: 'a' }, { name: 'l', selector: 'a', attr: 'href' }]);
  });
});

describe('replay', () => {
  const cap = { url: 'https://x.com/api?page=1', method: 'POST', reqHeaders: { authorization: 'x', accept: 'a' }, reqBody: '{"variables":{"page":1}}' };
  it('query y body', () => {
    const q = buildReplayRequest(cap, { mode: 'query', name: 'page', from: 1, to: 3, step: 1, delay: 0, nextPath: '', maxPages: 5 }, 3);
    expect(q.url).toContain('page=3');
    expect(q.headers.authorization).toBeUndefined();
    const b = buildReplayRequest(cap, { mode: 'body', name: 'variables.page', from: 1, to: 3, step: 1, delay: 0, nextPath: '', maxPages: 5 }, 4);
    expect(JSON.parse(b.body!).variables.page).toBe(4);
    const o: any = {}; setByPath(o, 'a.b[1].c', 5); expect(o.a.b[1].c).toBe(5);
  });
  it('curl', () => expect(toCurl(cap)).toContain("--data-raw '{\"variables\""));
});

describe('ids', () => {
  it('no colisionan entre pestañas', () => {
    expect(newId(1, 'fetch', 'u')).not.toBe(newId(2, 'fetch', 'u'));
    expect(newId(1, 'embedded', 'u')).toBe(newId(1, 'embedded', 'u'));
    expect(newId(1, 'embedded', 'u')).not.toBe(newId(2, 'embedded', 'u'));
  });
});
