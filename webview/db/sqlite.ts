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
  rowCount: number | null;
  sizeBytes: number | null;
};

/** Opaque handle to the wa-sqlite instance and the opened database. */
export type DbHandle = {
  sqlite3: any;
  db: number;
};

/** Default cap on rows materialised per query to keep memory bounded. */
export const DEFAULT_ROW_LIMIT = 5000;

/**
 * Skip eager per-table COUNT(*) above this size: counting forces a full table
 * scan, which is expensive when each page is fetched lazily over the VFS.
 */
const COUNT_SIZE_THRESHOLD = 200 * 1024 * 1024;

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

export async function listTables(
  handle: DbHandle,
  fileSize: number,
): Promise<TableInfo[]> {
  const meta = await query(
    handle,
    `SELECT name, type FROM sqlite_master
     WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
     ORDER BY type, name`,
    null,
  );

  const countRows = fileSize <= COUNT_SIZE_THRESHOLD;
  const tables: TableInfo[] = [];
  for (const row of meta.rows) {
    const name = String(row[0]);
    const type = row[1] === 'view' ? 'view' : 'table';
    let rowCount: number | null = null;
    if (type === 'table' && countRows) {
      try {
        const c = await query(
          handle,
          `SELECT COUNT(*) FROM "${name.replace(/"/g, '""')}"`,
          null,
        );
        rowCount = Number(c.rows[0]?.[0] ?? 0);
      } catch {
        rowCount = null;
      }
    }
    tables.push({
      name,
      type,
      rowCount,
      sizeBytes: null,
    });
  }
  return tables;
}

export async function loadTableSizes(
  handle: DbHandle,
  onProgress: (sizes: Map<string, number>, scannedPages: number) => void,
): Promise<Map<string, number>> {
  const objects = await query(
    handle,
    `SELECT name, tbl_name
     FROM sqlite_master
     WHERE type IN ('table','index')
       AND tbl_name NOT LIKE 'sqlite_%'`,
    null,
  );

  const tableByObject = new Map<string, string>();
  for (const row of objects.rows) {
    tableByObject.set(String(row[0]), String(row[1]));
  }

  const aggregateSizes = await loadAggregateTableSizes(handle, tableByObject);
  if (aggregateSizes) {
    onProgress(aggregateSizes, 0);
    return aggregateSizes;
  }

  const { sqlite3, db } = handle;
  const sizes = new Map<string, number>();
  let scannedPages = 0;
  let lastProgress = 0;

  for await (const stmt of sqlite3.statements(
    db,
    `SELECT name, pgsize FROM dbstat WHERE name NOT LIKE 'sqlite_%'`,
  )) {
    while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
      const [objectName, pgsize] = sqlite3.row(stmt);
      const tableName = tableByObject.get(String(objectName));
      if (!tableName) continue;

      scannedPages++;
      sizes.set(tableName, (sizes.get(tableName) ?? 0) + Number(pgsize ?? 0));
      if (scannedPages - lastProgress >= 250) {
        lastProgress = scannedPages;
        onProgress(new Map(sizes), scannedPages);
      }
    }
  }

  onProgress(new Map(sizes), scannedPages);
  return sizes;
}

async function loadAggregateTableSizes(
  handle: DbHandle,
  tableByObject: Map<string, string>,
): Promise<Map<string, number> | null> {
  try {
    const result = await query(
      handle,
      `SELECT name, pgsize FROM dbstat('main', 1)
       WHERE name NOT LIKE 'sqlite_%'`,
      null,
    );
    const sizes = new Map<string, number>();
    for (const row of result.rows) {
      const tableName = tableByObject.get(String(row[0]));
      if (!tableName) continue;
      sizes.set(tableName, (sizes.get(tableName) ?? 0) + Number(row[1] ?? 0));
    }
    return sizes;
  } catch {
    return null;
  }
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
