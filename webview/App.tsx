import { useCallback, useEffect, useState } from 'react';
import type { HostToWebview, WebviewToHost } from '../shared/protocol';
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
import { TableList } from './components/TableList';
import { Grid } from './components/Grid';
import { SqlRunner } from './components/SqlRunner';

type VsCodeApi = {
  postMessage: (msg: WebviewToHost) => void;
};

declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

export function App() {
  const [db, setDb] = useState<DbHandle | null>(null);
  const [fileName, setFileName] = useState('');
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectTable = useCallback(
    async (handle: DbHandle, name: string) => {
      setActive(name);
      setQueryError(null);
      setBusy(true);
      try {
        setResult(await runQuery(handle, selectFromTable(handle, name)));
      } catch (err) {
        setQueryError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    const handler = async (e: MessageEvent<HostToWebview>) => {
      const msg = e.data;
      if (msg.type === 'error') {
        setFatal(msg.message);
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

  return (
    <div className="app">
      <TableList
        tables={tables}
        active={active}
        onSelect={(name) => selectTable(db, name)}
      />
      <div className="main">
        <div className="titlebar">
          <span className="file-name">{fileName}</span>
        </div>
        <SqlRunner onRun={onRunSql} error={queryError} />
        {result?.truncated ? (
          <div className="truncated-banner">
            Showing the first {result.rows.length.toLocaleString()} rows. Add a
            narrower query to see more.
          </div>
        ) : null}
        {busy ? <div className="grid-empty">Running…</div> : null}
        {!busy && result ? (
          <Grid result={result} />
        ) : !busy ? (
          <div className="grid-empty">Select a table.</div>
        ) : null}
      </div>
    </div>
  );
}
