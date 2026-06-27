# Changelog

## Unreleased

- Large-file support: replaced sql.js full-load with wa-sqlite + a read-only
  async range VFS. Databases are read page-on-demand, so multi-gigabyte files
  open without loading into memory. Removed the 200 MB limit.
- Query results are capped (5,000 rows) with a truncation banner.
- Per-table `COUNT(*)` is skipped above 200 MB to avoid full scans.
- Logical names: a single toggle switches tables/columns between physical and
  logical (human-readable) names, with the physical name shown as subtext.
  Names come from a sibling `<db>.labels.json` or the `sqliteVscode.labelsPath`
  setting.
- The sidebar is now resizable by dragging the divider; the width is remembered.
- The SQL runner can be collapsed via the `SQL` section toggle; the state is
  remembered.
- Replaced the client-side grid filter with a `WHERE` bar that appends your
  condition to `SELECT * FROM <table>` and runs it in SQLite, so indexes are
  used and the whole table is searched (not just the loaded rows). Switching
  tables clears the condition; the read-only SQL guard still applies.
- A loading illustration is shown in the grid area while a query is running.

## 0.0.1

- Initial release.
- Read-only custom editor for `.db` / `.sqlite` / `.sqlite3` / `.db3`.
- Table & view list with row counts.
- Virtualized grid with column sort and row filtering.
- Column-width synced header/body, cell detail panel, BLOB hex preview.
- Read-only SQL runner (`SELECT` / `WITH` / `PRAGMA` / `EXPLAIN` only).
- Powered by sql.js (WASM); matches the VS Code color theme.
