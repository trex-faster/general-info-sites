import { useState } from 'react';
import { appendKey } from '@/lib/path';

interface Props { value: unknown; path: string; label?: string; depth?: number; selected: string; onPick: (path: string, v: unknown) => void }

export function Tree({ value, path, label, depth = 0, selected, onPick }: Props) {
  const [open, setOpen] = useState(depth < 1);
  const isArr = Array.isArray(value);
  const isObj = !!value && typeof value === 'object';
  const entries: [string | number, unknown][] = isArr ? (value as unknown[]).slice(0, 200).map((v, i) => [i, v]) : isObj ? Object.entries(value as object) : [];
  const more = isArr && (value as unknown[]).length > 200 ? (value as unknown[]).length - 200 : 0;
  const pick = () => onPick(path, value);
  return (
    <div className="tree-node">
      <div className={'tree-row' + (selected === path && path ? ' sel' : '')}>
        {isObj ? <button className="tw" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'}</button> : <span className="tw" />}
        {label !== undefined && <span className="tk" onClick={pick}>{label}</span>}
        {isObj
          ? <span className="tm" onClick={pick}>{isArr ? `[${(value as unknown[]).length}]` : `{${Object.keys(value as object).length}}`}</span>
          : <span className={'tv ' + typeof value} onClick={pick}>{typeof value === 'string' ? `"${value.length > 120 ? value.slice(0, 120) + '…' : value}"` : String(value)}</span>}
      </div>
      {isObj && open && (
        <div className="tree-kids">
          {entries.map(([k, v]) => (
            <Tree key={String(k)} value={v} path={appendKey(path, k)} label={String(k)} depth={depth + 1} selected={selected} onPick={onPick} />
          ))}
          {more > 0 && <div className="muted">… {more} más</div>}
        </div>
      )}
    </div>
  );
}
