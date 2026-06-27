import * as SQLite from 'wa-sqlite';
import SQLiteAsyncFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import { AsyncRangeVFS } from './vfs';
import type { RangeSource } from './rangeSource';

declare global {
  interface Window {
    WASQLITE_WASM_URI: string;
  }
}

export type SqlValue = number | bigint | string | Uint8Array | null;

export type QueryResult = {
  columns: string[];
  rows: SqlValue[][];
  /** True when more rows existed than the display limit allowed. */
  truncated: boolean;
};

export type TableInfo = {
  name: string;
  type: 'table' | 'view';
};

/** Opaque handle to the wa-sqlite instance and the opened database. */
export type DbHandle = {
  sqlite3: any;
  db: number;
};

/** Default cap on rows materialised per query to keep memory bounded. */
export const DEFAULT_ROW_LIMIT = 5000;

let handlePromise: Promise<DbHandle> | null = null;

export async function openDatabase(source: RangeSource): Promise<DbHandle> {
  const module = await SQLiteAsyncFactory({
    locateFile: () => window.WASQLITE_WASM_URI,
  });
  const sqlite3 = SQLite.Factory(module);
  const vfs = new AsyncRangeVFS(source);
  sqlite3.vfs_register(vfs as any, false);
  const db = await sqlite3.open_v2(
    'main.db',
    SQLite.SQLITE_OPEN_READONLY,
    vfs.name,
  );
  await enableSchemaRecoveryMode(sqlite3, db);
  const handle: DbHandle = { sqlite3, db };
  handlePromise = Promise.resolve(handle);
  return handle;
}

export function getDb(): Promise<DbHandle> {
  if (!handlePromise) {
    throw new Error('Database is not loaded yet.');
  }
  return handlePromise;
}

async function query(
  handle: DbHandle,
  sql: string,
  limit: number | null,
): Promise<QueryResult> {
  const { sqlite3, db } = handle;
  let columns: string[] = [];
  const rows: SqlValue[][] = [];
  let truncated = false;

  outer: for await (const stmt of sqlite3.statements(db, sql)) {
    columns = sqlite3.column_names(stmt);
    while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
      if (limit !== null && rows.length >= limit) {
        truncated = true;
        break outer;
      }
      rows.push(sqlite3.row(stmt));
    }
  }

  return { columns, rows, truncated };
}

async function enableSchemaRecoveryMode(sqlite3: any, db: number): Promise<void> {
  try {
    for await (const stmt of sqlite3.statements(db, 'PRAGMA writable_schema=ON')) {
      while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
        // Drain any rows for compatibility with pragma execution semantics.
      }
    }
  } catch {
    // Best effort only. The database is opened read-only, so this is used only
    // to tolerate malformed schema entries during introspection.
  }
}

export async function listTables(handle: DbHandle): Promise<TableInfo[]> {
  const meta = await query(
    handle,
    `SELECT name, type FROM sqlite_master
     WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
     ORDER BY type, name`,
    null,
  );

  const tables: TableInfo[] = [];
  for (const row of meta.rows) {
    const name = String(row[0]);
    const type = row[1] === 'view' ? 'view' : 'table';
    tables.push({ name, type });
  }
  return tables;
}

export function runQuery(
  handle: DbHandle,
  sql: string,
  limit: number | null = DEFAULT_ROW_LIMIT,
): Promise<QueryResult> {
  return query(handle, sql, limit);
}

export function selectFromTable(
  _handle: DbHandle,
  table: string,
  where?: string,
): string {
  const safe = table.replace(/"/g, '""');
  const base = `SELECT * FROM "${safe}"`;
  const clause = where?.trim();
  return clause ? `${base} WHERE ${clause}` : base;
}
