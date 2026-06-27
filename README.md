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
- Platform-independent (WASM via sql.js), matches your color theme

## Limitations

- Read-only. Loads the whole file into memory (≤ 200 MB).
- No write / DDL / DML statements.

## Develop

```bash
npm install
npm run build      # or: npm run watch
```

Then press `F5` ("Run Extension") and open a `.db` file in the new window.

## Architecture

- `src/` — extension host: `CustomReadonlyEditorProvider`, CSP webview HTML
- `webview/` — React UI + sql.js (WASM)
- `shared/protocol.ts` — typed postMessage protocol

## Package

```bash
npm run package    # produces a .vsix (requires @vscode/vsce)
```

## License

MIT
