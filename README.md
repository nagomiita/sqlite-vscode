# SQLite Vscode

A quick, read-only SQLite viewer for VS Code. Click a `.db` / `.sqlite` /
`.sqlite3` / `.db3` file and a virtualized table editor opens. Includes a
read-only SQL runner.

> Inspired by the design of DB Browser for SQLite and Airtable-style grids.
> Built from scratch (no third-party viewer code reused).

## Features

- Custom editor for `.db`, `.sqlite`, `.sqlite3`, `.db3`
- Table / view list with row counts
- Virtualized scrolling grid (sort, filter)
- Read-only SQL runner (`SELECT` / `WITH` / `PRAGMA` / `EXPLAIN` only)
- Opens multi-gigabyte databases via a lazy, on-demand VFS (only the pages a
  query touches are read; the file is never loaded into memory in full)
- Platform-independent (WASM via wa-sqlite), matches your color theme

## Limitations

- Read-only. No write / DDL / DML statements.
- Results are capped at 5,000 rows per query; a banner appears when truncated.
- Per-table `COUNT(*)` is skipped for files larger than 200 MB (full scans are
  expensive over the lazy VFS).

## Develop

```bash
npm install
npm run build      # or: npm run watch
```

Then press `F5` ("Run Extension") and open a `.db` file in the new window.

## Architecture

- `src/` — extension host: `CustomReadonlyEditorProvider`, byte-range file
  reads over a kept-open file handle, CSP webview HTML
- `webview/` — React UI + wa-sqlite (WASM) with a read-only async range VFS
- `shared/protocol.ts` — typed postMessage protocol (incl. lazy range reads)

## Package

```bash
npm run package    # produces a .vsix (requires @vscode/vsce)
```

## License

MIT
