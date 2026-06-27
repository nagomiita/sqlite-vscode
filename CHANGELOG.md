# Changelog

## Unreleased

- Large-file support: replaced sql.js full-load with wa-sqlite + a read-only
  async range VFS. Databases are read page-on-demand, so multi-gigabyte files
  open without loading into memory. Removed the 200 MB limit.
- Query results are capped (5,000 rows) with a truncation banner.
- Per-table `COUNT(*)` is skipped above 200 MB to avoid full scans.

## 0.0.1

- Initial release.
- Read-only custom editor for `.db` / `.sqlite` / `.sqlite3` / `.db3`.
- Table & view list with row counts.
- Virtualized grid with column sort and row filtering.
- Column-width synced header/body, cell detail panel, BLOB hex preview.
- Read-only SQL runner (`SELECT` / `WITH` / `PRAGMA` / `EXPLAIN` only).
- Powered by sql.js (WASM); matches the VS Code color theme.
