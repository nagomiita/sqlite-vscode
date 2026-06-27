import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

type GithubAsset = {
  name: string;
  browser_download_url: string;
};

type GithubRelease = {
  tag_name: string;
  html_url: string;
  assets: GithubAsset[];
};

const REPO_OWNER = 'nagomiita';
const REPO_NAME = 'sqlite-vscode';
const USER_AGENT = 'sqlite-vscode-updater';

function parseVersion(value: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareVersions(
  left: [number, number, number],
  right: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/octet-stream',
      'User-Agent': USER_AGENT,
    },
  });
  if (!res.ok) {
    throw new Error(
      `Failed to download update: ${res.status} ${res.statusText}`,
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  await fs.writeFile(dest, bytes);
}

export async function checkForUpdates(
  context: vscode.ExtensionContext,
): Promise<void> {
  const currentVersion = parseVersion(context.extension.packageJSON.version);
  if (!currentVersion) {
    vscode.window.showErrorMessage(
      'Cannot check for updates: invalid extension version.',
    );
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Checking for SQLite Vscode updates',
        cancellable: false,
      },
      async () => {
        const release = await fetchJson<GithubRelease>(
          `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
        );
        const latestVersion = parseVersion(release.tag_name);
        if (!latestVersion) {
          throw new Error(
            `Latest release tag is not a semver version: ${release.tag_name}`,
          );
        }

        if (compareVersions(latestVersion, currentVersion) <= 0) {
          vscode.window.showInformationMessage(
            `SQLite Vscode is already up to date (${release.tag_name}).`,
          );
          return;
        }

        const asset =
          release.assets.find((a) => a.name.endsWith('.vsix')) ?? null;
        if (!asset) {
          throw new Error(`No VSIX asset found on ${release.tag_name}.`);
        }

        const tempDir = await fs.mkdtemp(
          path.join(os.tmpdir(), 'sqlite-vscode-update-'),
        );
        const vsixPath = path.join(tempDir, asset.name);
        try {
          await downloadFile(asset.browser_download_url, vsixPath);
          await vscode.commands.executeCommand(
            'workbench.extensions.installExtension',
            vscode.Uri.file(vsixPath),
          );
          const reload = await vscode.window.showInformationMessage(
            `Installed ${release.tag_name}. Reload now to activate it.`,
            'Reload Window',
          );
          if (reload === 'Reload Window') {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
          }
        } finally {
          await fs.rm(tempDir, { recursive: true, force: true });
        }
      },
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      err instanceof Error ? err.message : String(err),
    );
  }
}
