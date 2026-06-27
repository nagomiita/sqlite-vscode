import * as VFS from 'wa-sqlite/src/VFS.js';
import type { RangeSource } from './rangeSource';

// The shipped Base typings model pData as a wrapper object, which disagrees
// with the runtime (plain Uint8Array). Treat the base as untyped so our
// runtime-correct overrides compile.
const Base: any = VFS.Base;

/**
 * Read-only, immutable SQLite VFS that serves pages on demand from a
 * {@link RangeSource}. Only the bytes SQLite actually touches are ever read,
 * which lets us open databases far larger than available memory.
 *
 * Writes/truncates are rejected; the file is reported as immutable so SQLite
 * skips journals and locking entirely.
 */
export class AsyncRangeVFS extends Base {
  name = 'range-readonly';
  mxPathName = 64;

  #source: RangeSource;
  #openFiles = new Set<number>();

  constructor(source: RangeSource) {
    super();
    this.#source = source;
  }

  xOpen(
    _name: string | null,
    fileId: number,
    flags: number,
    pOutFlags: DataView,
  ): number {
    this.#openFiles.add(fileId);
    pOutFlags.setInt32(0, flags, true);
    return VFS.SQLITE_OK;
  }

  xClose(fileId: number): number {
    this.#openFiles.delete(fileId);
    return VFS.SQLITE_OK;
  }

  xRead(fileId: number, pData: Uint8Array, iOffset: number): number {
    return this.handleAsync(async () => {
      const want = pData.byteLength;
      const size = this.#source.size();
      const end = Math.min(iOffset + want, size);
      const nBytes = Math.max(0, end - iOffset);

      if (nBytes > 0) {
        const chunk = await this.#source.read(iOffset, nBytes);
        const copyLen = Math.min(nBytes, chunk.byteLength);
        pData.set(chunk.subarray(0, copyLen), 0);
        if (copyLen < want) pData.fill(0, copyLen);
        if (copyLen < want) return VFS.SQLITE_IOERR_SHORT_READ;
        return VFS.SQLITE_OK;
      }

      pData.fill(0);
      return VFS.SQLITE_IOERR_SHORT_READ;
    });
  }

  xWrite(): number {
    return VFS.SQLITE_IOERR;
  }

  xTruncate(): number {
    return VFS.SQLITE_IOERR;
  }

  xSync(): number {
    return VFS.SQLITE_OK;
  }

  xFileSize(_fileId: number, pSize64: DataView): number {
    pSize64.setBigInt64(0, BigInt(this.#source.size()), true);
    return VFS.SQLITE_OK;
  }

  xLock(): number {
    return VFS.SQLITE_OK;
  }

  xUnlock(): number {
    return VFS.SQLITE_OK;
  }

  xCheckReservedLock(_fileId: number, pResOut: DataView): number {
    pResOut.setInt32(0, 0, true);
    return VFS.SQLITE_OK;
  }

  xSectorSize(): number {
    return 512;
  }

  xDeviceCharacteristics(): number {
    return VFS.SQLITE_IOCAP_IMMUTABLE;
  }

  xAccess(_name: string, _flags: number, pResOut: DataView): number {
    // Journal/WAL sidecars never exist for an immutable read-only file.
    pResOut.setInt32(0, 0, true);
    return VFS.SQLITE_OK;
  }

  xDelete(): number {
    return VFS.SQLITE_OK;
  }
}
