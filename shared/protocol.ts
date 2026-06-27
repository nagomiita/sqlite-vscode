/** Typed messages exchanged between the extension host and the webview. */

/** Extension host -> Webview */
export type HostToWebview =
  | { type: 'open'; fileName: string; size: number }
  | { type: 'read-result'; id: number; bytes: Uint8Array }
  | { type: 'read-error'; id: number; message: string }
  | { type: 'error'; message: string };

/** Webview -> Extension host */
export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'read'; id: number; offset: number; length: number }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };
