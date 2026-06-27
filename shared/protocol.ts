/** Typed messages exchanged between the extension host and the webview. */

/**
 * Optional human-readable (logical) names for tables and columns, supplied via
 * a sidecar `<db>.labels.json` file or the `sqliteVscode.labelsPath` setting.
 * SQLite has no native column comments, so labels must come from outside.
 */
export type Labels = {
  /** physical table name -> logical name */
  tables?: Record<string, string>;
  /** physical table name -> { physical column name -> logical name } */
  columns?: Record<string, Record<string, string>>;
};

/** Extension host -> Webview */
export type HostToWebview =
  | { type: 'open'; fileName: string; size: number }
  | { type: 'labels'; labels: Labels | null }
  | { type: 'read-result'; id: number; bytes: Uint8Array }
  | { type: 'read-error'; id: number; message: string }
  | { type: 'error'; message: string };

/** Webview -> Extension host */
export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'read'; id: number; offset: number; length: number }
  | { type: 'check-for-updates' }
  | { type: 'notify'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };
