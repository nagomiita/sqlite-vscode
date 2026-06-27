import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type {
  HostToWebview,
  Labels,
  WebviewToHost,
} from '../shared/protocol';
import {
  listTables,
  loadTableSizes,
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
import { estimateTextWidth } from './textMeasure';
import { formatBytes } from './format';

type TableMetricMode = 'rows' | 'size' | 'both';
type SizeLoadState = 'idle' | 'loading' | 'done' | 'unavailable';

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
  tableMetricMode?: TableMetricMode;
} | null;

const MIN_SIDEBAR = 160;
const MAX_SIDEBAR = 900;
const TABLE_SIZE_SCAN_TIMEOUT_MS = 15_000;

function log(level: 'info' | 'warn' | 'error', message: string): void {
  vscode.postMessage({ type: 'log', level, message });
}

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
    persisted?.sqlCollapsed ?? true,
  );
  const [tableMetricMode, setTableMetricMode] = useState<TableMetricMode>(
    persisted?.tableMetricMode ?? 'both',
  );
  const [sizeLoadState, setSizeLoadState] = useState<SizeLoadState>('idle');
  const [where, setWhere] = useState('');

  // Persist all UI preferences together so no key clobbers another.
  useEffect(() => {
    vscode.setState?.({
      showLogical,
      sidebarWidth,
      sqlCollapsed,
      tableMetricMode,
    });
  }, [showLogical, sidebarWidth, sqlCollapsed, tableMetricMode]);

  const toggleLogical = useCallback(() => {
    setShowLogical((prev) => !prev);
  }, []);

  const checkForUpdates = useCallback(() => {
    vscode.postMessage({ type: 'check-for-updates' });
  }, []);

  const effectiveSidebarWidth = useMemo(() => {
    if (!showLogical) return sidebarWidth;

    const required = tables.reduce((max, table) => {
      const logical = labels?.tables?.[table.name];
      if (!logical) return max;

      const primary = estimateTextWidth(logical, 13, 600);
      const sub = estimateTextWidth(table.name, 11, 400) + 6;
      const rowCount =
        tableMetricMode === 'size' || table.rowCount === null
          ? 0
          : estimateTextWidth(table.rowCount.toLocaleString(), 11, 400) + 12;
      const size =
        tableMetricMode === 'rows' || table.sizeBytes === null
          ? 0
          : estimateTextWidth(formatBytes(table.sizeBytes), 11, 600) + 12;
      const chrome = 24 + 18 + 12 + rowCount + size + 72;
      return Math.max(max, primary + sub + chrome);
    }, MIN_SIDEBAR);

    return Math.min(MAX_SIDEBAR, Math.max(sidebarWidth, required));
  }, [labels, showLogical, sidebarWidth, tableMetricMode, tables]);

  const onResizeStart = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = effectiveSidebarWidth;
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
    [effectiveSidebarWidth],
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
    if (!db) return;
    if (tableMetricMode === 'rows') return;
    if (sizeLoadState !== 'idle') return;

    const sizeTargets = tables.filter(
      (table) => table.type === 'table' && table.sizeBytes === null,
    );
    if (sizeTargets.length === 0) {
      setSizeLoadState('done');
      return;
    }

    let cancelled = false;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      timedOut = true;
      setSizeLoadState('unavailable');
      log(
        'warn',
        `dbstat table size scan timed out after ${TABLE_SIZE_SCAN_TIMEOUT_MS / 1000}s.`,
      );
      vscode.postMessage({
        type: 'notify',
        level: 'warn',
        message:
          'Table size calculation timed out. This database is too large or slow for dbstat size scanning.',
      });
    }, TABLE_SIZE_SCAN_TIMEOUT_MS);

    setSizeLoadState('loading');
    void (async () => {
      log('info', `Starting dbstat table size scan (${sizeTargets.length} tables).`);
      try {
        let lastLoggedPages = 0;
        await loadTableSizes(db, (sizes, scannedPages) => {
          if (cancelled || timedOut) return;
          setTables((prev) =>
            prev.map((item) => {
              const sizeBytes = sizes.get(item.name);
              return sizeBytes === undefined ? item : { ...item, sizeBytes };
            }),
          );
          if (scannedPages === 0) {
            log(
              'info',
              `dbstat aggregate size scan returned ${sizes.size.toLocaleString()} tables.`,
            );
            return;
          }
          if (scannedPages - lastLoggedPages >= 1000) {
            lastLoggedPages = scannedPages;
            log(
              'info',
              `dbstat table size scan progress: ${scannedPages.toLocaleString()} pages scanned.`,
            );
          }
        });
      } catch (err) {
        if (!cancelled && !timedOut) {
          window.clearTimeout(timeout);
          const message = err instanceof Error ? err.message : String(err);
          setSizeLoadState('unavailable');
          log('warn', `dbstat table size scan failed: ${message}`);
          vscode.postMessage({
            type: 'notify',
            level: 'warn',
            message:
              'Table size display is unavailable because SQLite dbstat is not enabled.',
          });
        }
        return;
      }
      if (!cancelled && !timedOut) {
        window.clearTimeout(timeout);
        log('info', 'Finished dbstat table size scan.');
        setSizeLoadState('done');
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [db, sizeLoadState, tableMetricMode, tables]);

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
          log('info', `Opening database ${msg.fileName} (${msg.size.toLocaleString()} bytes).`);
          const handle = await openDatabase(source);
          setDb(handle);
          setFileName(msg.fileName);
          log('info', 'Loading table list.');
          const t = await listTables(handle, msg.size);
          log('info', `Loaded ${t.length.toLocaleString()} tables/views.`);
          setTables(t);
          setSizeLoadState('idle');
          if (t.length > 0) {
            await selectTable(handle, t[0].name);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log('error', `Failed to open database: ${message}`);
          setFatal(message);
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
        width={effectiveSidebarWidth}
        metricMode={tableMetricMode}
        onMetricModeChange={setTableMetricMode}
        sizeLoadState={sizeLoadState}
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
          <div className="title-actions">
            <button
              type="button"
              className="update-check"
              onClick={checkForUpdates}
              title="Check for extension updates"
            >
              Check for Updates
            </button>
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
