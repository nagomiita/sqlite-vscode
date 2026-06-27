import { useCallback, useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type {
  HostToWebview,
  Labels,
  WebviewToHost,
} from '../shared/protocol';
import {
  listTables,
  openDatabase,
  runQuery,
  selectFromTable,
  type DbHandle,
  type QueryResult,
  type TableInfo,
} from './db/sqlite';
import { HostRangeSource } from './db/rangeSource';
import { guardReadOnlySql } from './db/guard';
import { TableList } from './components/TableList';
import { Grid } from './components/Grid';
import { SqlRunner } from './components/SqlRunner';

type VsCodeApi = {
  postMessage: (msg: WebviewToHost) => void;
  getState?: () => unknown;
  setState?: (state: unknown) => void;
};

declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

const persisted = (vscode.getState?.() ?? null) as {
  showLogical?: boolean;
  sidebarWidth?: number;
  sqlCollapsed?: boolean;
} | null;

const MIN_SIDEBAR = 160;
const MAX_SIDEBAR = 600;

export function App() {
  const [db, setDb] = useState<DbHandle | null>(null);
  const [fileName, setFileName] = useState('');
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [labels, setLabels] = useState<Labels | null>(null);
  const [showLogical, setShowLogical] = useState<boolean>(
    persisted?.showLogical ?? false,
  );
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    persisted?.sidebarWidth ?? 240,
  );
  const [sqlCollapsed, setSqlCollapsed] = useState<boolean>(
    persisted?.sqlCollapsed ?? false,
  );
  const [where, setWhere] = useState('');

  // Persist all UI preferences together so no key clobbers another.
  useEffect(() => {
    vscode.setState?.({ showLogical, sidebarWidth, sqlCollapsed });
  }, [showLogical, sidebarWidth, sqlCollapsed]);

  const toggleLogical = useCallback(() => {
    setShowLogical((prev) => !prev);
  }, []);

  const onResizeStart = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = sidebarWidth;
      const onMove = (ev: PointerEvent) => {
        const next = Math.min(
          MAX_SIDEBAR,
          Math.max(MIN_SIDEBAR, startW + ev.clientX - startX),
        );
        setSidebarWidth(next);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.classList.remove('resizing');
      };
      document.body.classList.add('resizing');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [sidebarWidth],
  );

  const selectTable = useCallback(
    async (handle: DbHandle, name: string, whereClause = '') => {
      setActive(name);
      const sql = selectFromTable(handle, name, whereClause);
      if (whereClause.trim()) {
        const guard = guardReadOnlySql(sql);
        if (!guard.ok) {
          setQueryError(guard.reason);
          return;
        }
      }
      setQueryError(null);
      setBusy(true);
      try {
        setResult(await runQuery(handle, sql));
      } catch (err) {
        setQueryError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const applyWhere = useCallback(() => {
    if (db && active) selectTable(db, active, where);
  }, [db, active, where, selectTable]);

  const clearWhere = useCallback(() => {
    setWhere('');
    if (db && active) selectTable(db, active, '');
  }, [db, active, selectTable]);

  useEffect(() => {
    const handler = async (e: MessageEvent<HostToWebview>) => {
      const msg = e.data;
      if (msg.type === 'error') {
        setFatal(msg.message);
        return;
      }
      if (msg.type === 'labels') {
        setLabels(msg.labels);
        return;
      }
      if (msg.type === 'open') {
        try {
          const source = new HostRangeSource(vscode, msg.size);
          const handle = await openDatabase(source);
          setDb(handle);
          setFileName(msg.fileName);
          const t = await listTables(handle, msg.size);
          setTables(t);
          if (t.length > 0) {
            await selectTable(handle, t[0].name);
          }
        } catch (err) {
          setFatal(err instanceof Error ? err.message : String(err));
        }
      }
    };
    window.addEventListener('message', handler);
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRunSql = useCallback(
    async (sql: string) => {
      if (!db) return;
      setActive(null);
      setBusy(true);
      try {
        setResult(await runQuery(db, sql));
        setQueryError(null);
      } catch (err) {
        setQueryError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [db],
  );

  if (fatal) {
    return <div className="fatal">{fatal}</div>;
  }
  if (!db) {
    return <div className="loading">Loading database…</div>;
  }

  const loadingSrc = (window as unknown as { LOADING_IMAGE_URI?: string })
    .LOADING_IMAGE_URI;
  const hasLabels = Boolean(
    labels && (labels.tables || labels.columns),
  );
  const columnLabels =
    active && labels?.columns ? labels.columns[active] : undefined;

  return (
    <div className="app">
      <TableList
        tables={tables}
        active={active}
        onSelect={(name) => {
          setWhere('');
          selectTable(db, name);
        }}
        labels={labels}
        showLogical={showLogical}
        width={sidebarWidth}
      />
      <div
        className="resizer"
        onPointerDown={onResizeStart}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
      />
      <div className="main">
        <div className="titlebar">
          <span className="file-name">{fileName}</span>
          {hasLabels && (
            <button
              type="button"
              className={`logical-toggle${showLogical ? ' on' : ''}`}
              onClick={toggleLogical}
              title="Toggle logical / physical names"
            >
              {showLogical ? 'Logical names' : 'Physical names'}
            </button>
          )}
        </div>
        <div className="section-bar">
          <button
            type="button"
            className="section-toggle"
            onClick={() => setSqlCollapsed((v) => !v)}
            aria-expanded={!sqlCollapsed}
          >
            <span className="chevron">{sqlCollapsed ? '▸' : '▾'}</span>
            SQL
          </button>
        </div>
        {!sqlCollapsed && <SqlRunner onRun={onRunSql} error={queryError} />}
        {active && (
          <div className="where-bar">
            <span className="where-label">WHERE</span>
            <input
              className="where-input"
              placeholder="age > 30 AND name LIKE 'A%'  — runs as SQL, uses indexes"
              value={where}
              spellCheck={false}
              onChange={(e) => setWhere(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyWhere();
              }}
              title="Type the condition after WHERE. It is appended to SELECT * FROM the active table and executed in SQLite, so indexes are used and the whole table is searched (not just loaded rows)."
            />
            <button type="button" className="where-run" onClick={applyWhere}>
              Apply
            </button>
            {where && (
              <button
                type="button"
                className="where-clear"
                onClick={clearWhere}
              >
                Clear
              </button>
            )}
          </div>
        )}
        {result?.truncated ? (
          <div className="truncated-banner">
            Showing the first {result.rows.length.toLocaleString()} rows. Add a
            narrower query to see more.
          </div>
        ) : null}
        {busy ? (
          <div className="grid-loading">
            {loadingSrc && (
              <img className="grid-loading-img" src={loadingSrc} alt="" />
            )}
            <div className="grid-loading-text">Running…</div>
          </div>
        ) : null}
        {!busy && result ? (
          <Grid
            result={result}
            columnLabels={columnLabels}
            showLogical={showLogical}
          />
        ) : !busy ? (
          <div className="grid-empty">Select a table.</div>
        ) : null}
      </div>
    </div>
  );
}
