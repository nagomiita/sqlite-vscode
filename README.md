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
- Logical (human-readable) names for tables/columns via a single toggle, with
  the physical name kept as subtext. Names are read from a sibling
  `<db>.labels.json` or the `sqliteVscode.labelsPath` setting
- Platform-independent (WASM via wa-sqlite), matches your color theme

## Limitations

- Read-only. No write / DDL / DML statements.
- Results are capped at 5,000 rows per query; a banner appears when truncated.
- Per-table `COUNT(*)` is skipped for files larger than 200 MB (full scans are
  expensive over the lazy VFS).

## Logical names

SQLite has no native column comments, so logical names are supplied externally.
Place a `<dbFileName>.labels.json` next to the database (e.g. `local.db` ->
`local.db.labels.json`), or point `sqliteVscode.labelsPath` at one:

```json
{
  "tables": { "system_aws_lambda_logs": "AWS Lambda ログ" },
  "columns": {
    "system_aws_lambda_logs": { "function_name": "関数名" }
  }
}
```

The toolbar toggle then switches all tables/columns between physical and logical
names (the physical name stays visible as subtext). Items without a label fall
back to the physical name.

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

## CI and Release

GitHub Actions runs type checking, build, and VSIX packaging on pull requests
and pushes to `main`.

To publish a GitHub Release with the VSIX attached, run the Release workflow
manually. It bumps `package.json` to the next patch version, creates the matching
`vX.Y.Z` tag, and publishes the VSIX. Pushing an existing `vX.Y.Z` tag still
publishes that tag after validating it matches `package.json`.

## Update

If you install from a GitHub Release `.vsix`, use the viewer titlebar button or
the command palette command `SQLite Vscode: Check for Updates` to download the
latest GitHub Release asset, install it, and reload the window.

## License

MIT
