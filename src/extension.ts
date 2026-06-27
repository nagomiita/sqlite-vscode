import * as vscode from 'vscode';
import { SqliteEditorProvider } from './editorProvider';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(SqliteEditorProvider.register(context));
}

export function deactivate(): void {
  // no-op
}
