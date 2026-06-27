// wa-sqlite ships untyped JS; declare its entry points loosely so tsc accepts
// the dynamic API surface we use (Factory, constants, VFS.Base).
declare module 'wa-sqlite';
declare module 'wa-sqlite/src/VFS.js';
declare module 'wa-sqlite/dist/wa-sqlite-async.mjs';
