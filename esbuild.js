// @ts-check
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** Copy the wa-sqlite (Asyncify) wasm binary into media/ for the webview. */
function copyWasm() {
  const src = require.resolve('wa-sqlite/dist/wa-sqlite-async.wasm');
  const destDir = path.join(__dirname, 'media');
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, 'wa-sqlite-async.wasm'));
}

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  outfile: 'dist/extension.js',
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ['webview/main.tsx'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  sourcemap: !production,
  minify: production,
  outfile: 'dist/webview/main.js',
  loader: { '.css': 'css' },
  define: { 'process.env.NODE_ENV': production ? '"production"' : '"development"' },
  logLevel: 'info',
};

async function main() {
  copyWasm();
  if (watch) {
    const ctxExt = await esbuild.context(extensionConfig);
    const ctxWeb = await esbuild.context(webviewConfig);
    await Promise.all([ctxExt.watch(), ctxWeb.watch()]);
    console.log('[esbuild] watching...');
  } else {
    await Promise.all([esbuild.build(extensionConfig), esbuild.build(webviewConfig)]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
