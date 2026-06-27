import initSqlJs, { type Database, type SqlValue } from 'sql.js';

declare global {
  interface Window {
    SQLJS_WASM_URI: string;
  }
}

export type QueryResult = {
  columns: string[];
  rows: SqlValue[][];
};

export type TableInfo = {
  name: string;
  type: 'table' | 'view';
  rowCount: number | null;
};

let dbPromise: Promise<Database> | null = null;

export async function openDatabase(bytes: Uint8Array): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: () => window.SQLJS_WASM_URI,
  });
  const db = new SQL.Database(bytes);
  dbPromise = Promise.resolve(db);
  return db;
}

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    throw new Error('Database is not loaded yet.');
  }
  return dbPromise;
}

export async function listTables(db: Database): Promise<TableInfo[]> {
  const res = db.exec(
    `SELECT name, type FROM sqlite_master
     WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
     ORDER BY type, name`,
  );
  if (res.length === 0) return [];
  const tables: TableInfo[] = [];
  for (const row of res[0].values) {
    const name = String(row[0]);
    const type = row[1] === 'view' ? 'view' : 'table';
    let rowCount: number | null = null;
    if (type === 'table') {
      try {
        const c = db.exec(`SELECT COUNT(*) FROM "${name.replace(/"/g, '""')}"`);
        rowCount = Number(c[0]?.values[0]?.[0] ?? 0);
      } catch {
        rowCount = null;
      }
    }
    tables.push({ name, type, rowCount });
  }
  return tables;
}

export function runQuery(db: Database, sql: string): QueryResult {
  const res = db.exec(sql);
  if (res.length === 0) {
    return { columns: [], rows: [] };
  }
  // Only surface the first result set (single-statement guard upstream).
  return { columns: res[0].columns, rows: res[0].values };
}

export function selectFromTable(db: Database, table: string): string {
  const safe = table.replace(/"/g, '""');
  return `SELECT * FROM "${safe}"`;
}
