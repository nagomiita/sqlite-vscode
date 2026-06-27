import * as vscode from 'vscode';
import { SqliteEditorProvider } from './editorProvider';
import { checkForUpdates } from './update';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(SqliteEditorProvider.register(context));
  context.subscriptions.push(
    vscode.commands.registerCommand('sqliteVscode.checkForUpdates', () =>
      checkForUpdates(context),
    ),
  );
}

export function deactivate(): void {
  // no-op
}
