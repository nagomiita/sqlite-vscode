import { useCallback, useEffect, useState } from 'react';
import type { Database } from 'sql.js';
import type { HostToWebview, WebviewToHost } from '../shared/protocol';
import {
  listTables,
  openDatabase,
  runQuery,
  selectFromTable,
  type QueryResult,
  type TableInfo,
} from './db/sqlite';
import { TableList } from './components/TableList';
import { Grid } from './components/Grid';
import { SqlRunner } from './components/SqlRunner';

type VsCodeApi = {
  postMessage: (msg: WebviewToHost) => void;
};

declare function acquireVsCodeApi(): VsCodeApi;
const vscode = acquireVsCodeApi();

export function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [fileName, setFileName] = useState('');
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  useEffect(() => {
    const handler = async (e: MessageEvent<HostToWebview>) => {
      const msg = e.data;
      if (msg.type === 'error') {
        setFatal(msg.message);
        return;
      }
      if (msg.type === 'init') {
        try {
          const database = await openDatabase(new Uint8Array(msg.bytes));
          setDb(database);
          setFileName(msg.fileName);
          const t = await listTables(database);
          setTables(t);
          if (t.length > 0) {
            selectTable(database, t[0].name);
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

  const selectTable = useCallback((database: Database, name: string) => {
    setActive(name);
    setQueryError(null);
    try {
      setResult(runQuery(database, selectFromTable(database, name)));
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const onRunSql = useCallback(
    (sql: string) => {
      if (!db) return;
      setActive(null);
      try {
        setResult(runQuery(db, sql));
        setQueryError(null);
      } catch (err) {
        setQueryError(err instanceof Error ? err.message : String(err));
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
        {result ? (
          <Grid result={result} />
        ) : (
          <div className="grid-empty">Select a table.</div>
        )}
      </div>
    </div>
  );
}
