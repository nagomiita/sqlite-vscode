import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { HostToWebview, Labels, WebviewToHost } from '../shared/protocol';
import { getWebviewHtml } from './webviewHtml';

class SqliteDocument implements vscode.CustomDocument {
  constructor(public readonly uri: vscode.Uri) {}
  dispose(): void {
    // Nothing to clean up: the file handle is owned per editor panel.
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

    // File handle is opened lazily on the first read and kept open for the
    // lifetime of the panel so the webview can pull pages on demand.
    let handle: fs.FileHandle | null = null;
    let opening: Promise<fs.FileHandle> | null = null;

    const getHandle = (): Promise<fs.FileHandle> => {
      if (handle) return Promise.resolve(handle);
      if (!opening) {
        opening = fs.open(document.uri.fsPath, 'r').then((h) => {
          handle = h;
          return h;
        });
      }
      return opening;
    };

    const sub = webview.onDidReceiveMessage(async (msg: WebviewToHost) => {
      if (msg.type === 'ready') {
        await this.sendOpen(document.uri, post);
        await this.sendLabels(document.uri, post);
      } else if (msg.type === 'read') {
        await this.handleRead(msg, getHandle, post);
      } else if (msg.type === 'check-for-updates') {
        await vscode.commands.executeCommand('sqliteVscode.checkForUpdates');
      } else if (msg.type === 'log') {
        const out = `[sqlite-vscode] ${msg.message}`;
        if (msg.level === 'error') console.error(out);
        else if (msg.level === 'warn') console.warn(out);
        else console.log(out);
      }
    });

    webviewPanel.onDidDispose(() => {
      sub.dispose();
      handle?.close().catch(() => undefined);
      handle = null;
    });
  }

  private async sendOpen(
    uri: vscode.Uri,
    post: (msg: HostToWebview) => Thenable<boolean>,
  ): Promise<void> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      const fileName = uri.path.split('/').pop() ?? 'database';
      post({ type: 'open', fileName, size: stat.size });
    } catch (err) {
      post({
        type: 'error',
        message: `Failed to open file: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  }

  /**
   * Load optional logical names for tables/columns. Resolution order:
   *   1. the `sqliteVscode.labelsPath` setting (absolute, or relative to the db)
   *   2. a sibling `<dbFileName>.labels.json`
   * Missing or malformed files are treated as "no labels" (non-fatal).
   */
  private async sendLabels(
    uri: vscode.Uri,
    post: (msg: HostToWebview) => Thenable<boolean>,
  ): Promise<void> {
    const labels = await this.loadLabels(uri);
    post({ type: 'labels', labels });
  }

  private async loadLabels(uri: vscode.Uri): Promise<Labels | null> {
    const candidates: string[] = [];
    const configured = vscode.workspace
      .getConfiguration('sqliteVscode')
      .get<string>('labelsPath');
    if (configured) {
      candidates.push(
        path.isAbsolute(configured)
          ? configured
          : path.join(path.dirname(uri.fsPath), configured),
      );
    }
    candidates.push(`${uri.fsPath}.labels.json`);

    for (const file of candidates) {
      try {
        const text = await fs.readFile(file, 'utf8');
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          return {
            tables:
              parsed.tables && typeof parsed.tables === 'object'
                ? parsed.tables
                : undefined,
            columns:
              parsed.columns && typeof parsed.columns === 'object'
                ? parsed.columns
                : undefined,
          };
        }
      } catch {
        // Try the next candidate; absence is expected.
      }
    }
    return null;
  }

  private async handleRead(
    msg: { id: number; offset: number; length: number },
    getHandle: () => Promise<fs.FileHandle>,
    post: (msg: HostToWebview) => Thenable<boolean>,
  ): Promise<void> {
    try {
      const fh = await getHandle();
      const buffer = Buffer.allocUnsafe(msg.length);
      const { bytesRead } = await fh.read(
        buffer,
        0,
        msg.length,
        msg.offset,
      );
      const bytes = new Uint8Array(
        buffer.buffer,
        buffer.byteOffset,
        bytesRead,
      );
      post({ type: 'read-result', id: msg.id, bytes });
    } catch (err) {
      post({
        type: 'read-error',
        id: msg.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
