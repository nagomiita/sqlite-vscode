import * as vscode from 'vscode';
import type { HostToWebview, WebviewToHost } from '../shared/protocol';
import { getWebviewHtml } from './webviewHtml';

/** 200 MB hard limit, matching the in-memory loading model. */
const MAX_FILE_SIZE = 200 * 1024 * 1024;

class SqliteDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {
    // Nothing to clean up: bytes live in the webview.
  }
}

export class SqliteEditorProvider
  implements vscode.CustomReadonlyEditorProvider<SqliteDocument>
{
  public static readonly viewType = 'sqliteVscode.viewer';

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      SqliteEditorProvider.viewType,
      new SqliteEditorProvider(context),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): SqliteDocument {
    return new SqliteDocument(uri);
  }

  async resolveCustomEditor(
    document: SqliteDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    const webview = webviewPanel.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      ],
    };

    webview.html = getWebviewHtml(webview, this.context.extensionUri);

    const post = (msg: HostToWebview) => webview.postMessage(msg);

    const sub = webview.onDidReceiveMessage(async (msg: WebviewToHost) => {
      if (msg.type === 'ready') {
        await this.sendFile(document.uri, post);
      } else if (msg.type === 'log') {
        const out = `[sqlite-vscode] ${msg.message}`;
        if (msg.level === 'error') console.error(out);
        else if (msg.level === 'warn') console.warn(out);
        else console.log(out);
      }
    });

    webviewPanel.onDidDispose(() => sub.dispose());
  }

  private async sendFile(
    uri: vscode.Uri,
    post: (msg: HostToWebview) => Thenable<boolean>,
  ): Promise<void> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_FILE_SIZE) {
        post({
          type: 'error',
          message: `File is too large (${(stat.size / 1024 / 1024).toFixed(
            1,
          )} MB). The limit is 200 MB.`,
        });
        return;
      }
      const bytes = await vscode.workspace.fs.readFile(uri);
      const fileName = uri.path.split('/').pop() ?? 'database';
      post({ type: 'init', bytes, fileName });
    } catch (err) {
      post({
        type: 'error',
        message: `Failed to read file: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  }
}
