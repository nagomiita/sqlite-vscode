/** Typed messages exchanged between the extension host and the webview. */

/** Extension host -> Webview */
export type HostToWebview =
  | { type: 'init'; bytes: Uint8Array; fileName: string }
  | { type: 'error'; message: string };

/** Webview -> Extension host */
export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };
