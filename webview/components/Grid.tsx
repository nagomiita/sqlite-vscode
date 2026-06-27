import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { SqlValue } from 'sql.js';
import type { QueryResult } from '../db/sqlite';

type SortState = { col: number; dir: 'asc' | 'desc' } | null;

type Props = {
  result: QueryResult;
};

function formatValue(v: SqlValue): string {
  if (v === null) return '';
  if (v instanceof Uint8Array) return `[BLOB ${v.length}B]`;
  return String(v);
}

function compare(a: SqlValue, b: SqlValue): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

const ROW_HEIGHT = 26;

export function Grid({ result }: Props) {
  const { columns, rows } = result;
  const [sort, setSort] = useState<SortState>(null);
  const [filter, setFilter] = useState('');
  const parentRef = useRef<HTMLDivElement>(null);

  const processed = useMemo(() => {
    let out = rows;
    if (filter.trim()) {
      const f = filter.toLowerCase();
      out = out.filter((r) =>
        r.some((c) => formatValue(c).toLowerCase().includes(f)),
      );
    }
    if (sort) {
      const { col, dir } = sort;
      out = [...out].sort((ra, rb) => {
        const c = compare(ra[col], rb[col]);
        return dir === 'asc' ? c : -c;
      });
    }
    return out;
  }, [rows, sort, filter]);

  const rowVirtualizer = useVirtualizer({
    count: processed.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const toggleSort = (col: number) => {
    setSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return null;
    });
  };

  if (columns.length === 0) {
    return <div className="grid-empty">No rows returned.</div>;
  }

  return (
    <div className="grid-wrap">
      <div className="grid-toolbar">
        <input
          className="filter-input"
          placeholder="Filter rows..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="grid-count">
          {processed.length.toLocaleString()} rows
        </span>
      </div>
      <div className="grid-scroll" ref={parentRef}>
        <table className="grid-table">
          <thead>
            <tr>
              <th className="idx-col">#</th>
              {columns.map((c, i) => (
                <th key={i} onClick={() => toggleSort(i)} title={c}>
                  {c}
                  {sort?.col === i && (
                    <span className="sort-ind">
                      {sort.dir === 'asc' ? ' ▲' : ' ▼'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
        </table>
        <div
          className="grid-body"
          style={{ height: rowVirtualizer.getTotalSize() }}
        >
          {rowVirtualizer.getVirtualItems().map((vi) => {
            const row = processed[vi.index];
            return (
              <div
                key={vi.key}
                className="grid-row"
                style={{
                  transform: `translateY(${vi.start}px)`,
                  height: ROW_HEIGHT,
                }}
              >
                <div className="cell idx-col">{vi.index + 1}</div>
                {row.map((c, ci) => (
                  <div
                    key={ci}
                    className={`cell${c === null ? ' null-cell' : ''}`}
                    title={formatValue(c)}
                  >
                    {c === null ? 'NULL' : formatValue(c)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
