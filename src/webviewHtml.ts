import * as vscode from 'vscode';

function getNonce(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const nonce = getNonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js'),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.css'),
  );
  const wasmUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'wa-sqlite-async.wasm'),
  );
  const loadingUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'loading.png'),
  );

  const csp = [
    `default-src 'none'`,
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval'`,
    `style-src ${webview.cspSource} 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
    `connect-src ${webview.cspSource}`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>SQLite Vscode</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.WASQLITE_WASM_URI = ${JSON.stringify(wasmUri.toString())};
    window.LOADING_IMAGE_URI = ${JSON.stringify(loadingUri.toString())};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
