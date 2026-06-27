import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { QueryResult, SqlValue } from '../db/sqlite';

type SortState = { col: number; dir: 'asc' | 'desc' } | null;

type Props = {
  result: QueryResult;
  /** physical column name -> logical name (only for an active table view). */
  columnLabels?: Record<string, string>;
  showLogical?: boolean;
};

function isBlob(v: SqlValue): v is Uint8Array {
  return v instanceof Uint8Array;
}

function formatValue(v: SqlValue): string {
  if (v === null) return '';
  if (isBlob(v)) return `[BLOB ${v.length} B]`;
  return String(v);
}

function toHex(bytes: Uint8Array, max = 4096): string {
  const slice = bytes.subarray(0, max);
  const lines: string[] = [];
  for (let i = 0; i < slice.length; i += 16) {
    const chunk = slice.subarray(i, i + 16);
    const hex = Array.from(chunk)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = Array.from(chunk)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.'))
      .join('');
    const offset = i.toString(16).padStart(8, '0');
    lines.push(`${offset}  ${hex.padEnd(47)}  ${ascii}`);
  }
  let out = lines.join('\n');
  if (bytes.length > max) out += `\n… (${bytes.length - max} more bytes)`;
  return out;
}

function compare(a: SqlValue, b: SqlValue): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

const ROW_HEIGHT = 26;
const IDX_WIDTH = 56;
const CHAR_PX = 7.5;
const MIN_COL = 80;
const MAX_COL = 360;

export function Grid({ result, columnLabels, showLogical }: Props) {
  const { columns, rows } = result;
  const [sort, setSort] = useState<SortState>(null);
  const [filter, setFilter] = useState('');
  const [detail, setDetail] = useState<{
    column: string;
    value: SqlValue;
  } | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const headers = useMemo(
    () =>
      columns.map((c) => {
        const logical = showLogical ? columnLabels?.[c] : undefined;
        return { physical: c, logical, primary: logical ?? c };
      }),
    [columns, columnLabels, showLogical],
  );

  const colWidths = useMemo(() => {
    const sample = rows.slice(0, 200);
    return columns.map((c, i) => {
      let maxLen = headers[i].primary.length;
      for (const r of sample) {
        const len = formatValue(r[i]).length;
        if (len > maxLen) maxLen = len;
      }
      return Math.min(
        MAX_COL,
        Math.max(MIN_COL, Math.round(maxLen * CHAR_PX) + 20),
      );
    });
  }, [columns, rows, headers]);

  const template = useMemo(
    () => `${IDX_WIDTH}px ${colWidths.map((w) => `${w}px`).join(' ')}`,
    [colWidths],
  );

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

  const totalWidth = IDX_WIDTH + colWidths.reduce((a, b) => a + b, 0);

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
        <div className="grid-inner" style={{ width: totalWidth }}>
          <div className="grid-head" style={{ gridTemplateColumns: template }}>
            <div className="hcell idx-col">#</div>
            {columns.map((c, i) => (
              <div
                key={i}
                className="hcell"
                onClick={() => toggleSort(i)}
                title={
                  headers[i].logical
                    ? `${headers[i].logical} (${c})`
                    : c
                }
              >
                <span className="hcell-name">
                  <span className="name-primary">{headers[i].primary}</span>
                  {headers[i].logical && (
                    <span className="name-sub">{c}</span>
                  )}
                </span>
                {sort?.col === i && (
                  <span className="sort-ind">
                    {sort.dir === 'asc' ? '▲' : '▼'}
                  </span>
                )}
              </div>
            ))}
          </div>
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
                    gridTemplateColumns: template,
                  }}
                >
                  <div className="cell idx-col">{vi.index + 1}</div>
                  {row.map((c, ci) => (
                    <div
                      key={ci}
                      className={`cell${c === null ? ' null-cell' : ''}${
                        isBlob(c) ? ' blob-cell' : ''
                      }`}
                      title={formatValue(c)}
                      onClick={() =>
                        setDetail({
                          column: headers[ci].logical
                            ? `${headers[ci].logical} (${columns[ci]})`
                            : columns[ci],
                          value: c,
                        })
                      }
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
      {detail && (
        <CellDetail detail={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

function CellDetail({
  detail,
  onClose,
}: {
  detail: { column: string; value: SqlValue };
  onClose: () => void;
}) {
  const { column, value } = detail;
  let body: string;
  let kind: string;
  if (value === null) {
    body = 'NULL';
    kind = 'null';
  } else if (isBlob(value)) {
    body = toHex(value);
    kind = `BLOB · ${value.length} B`;
  } else {
    body = String(value);
    kind = typeof value;
  }
  return (
    <div className="detail-panel">
      <div className="detail-header">
        <span className="detail-col">{column}</span>
        <span className="detail-kind">{kind}</span>
        <button type="button" className="detail-close" onClick={onClose}>
          ✕
        </button>
      </div>
      <pre className="detail-body">{body}</pre>
    </div>
  );
}
