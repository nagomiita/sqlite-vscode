/**
 * Abstraction over a random-access byte source backing the SQLite database.
 *
 * The lazy VFS reads only the pages SQLite asks for, so the underlying file is
 * never loaded into memory in full. This is what makes multi-gigabyte
 * databases viewable.
 */
import type { WebviewToHost } from '../../shared/protocol';

export interface RangeSource {
  /** Total size of the database file in bytes. */
  size(): number;
  /** Read up to `length` bytes starting at `offset`. May return fewer bytes. */
  read(offset: number, length: number): Promise<Uint8Array>;
}

type VsCodeApi = {
  postMessage: (msg: WebviewToHost) => void;
};

type PendingRead = {
  resolve: (bytes: Uint8Array) => void;
  reject: (err: Error) => void;
};

/**
 * Range source that fetches byte ranges from the extension host over
 * postMessage. The host keeps a file handle open and answers `read` requests.
 */
export class HostRangeSource implements RangeSource {
  #vscode: VsCodeApi;
  #size: number;
  #nextId = 1;
  #pending = new Map<number, PendingRead>();

  constructor(vscode: VsCodeApi, size: number) {
    this.#vscode = vscode;
    this.#size = size;
    window.addEventListener('message', this.#onMessage);
  }

  size(): number {
    return this.#size;
  }

  read(offset: number, length: number): Promise<Uint8Array> {
    const id = this.#nextId++;
    return new Promise<Uint8Array>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#vscode.postMessage({ type: 'read', id, offset, length });
    });
  }

  #onMessage = (e: MessageEvent) => {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'read-result') {
      const p = this.#pending.get(msg.id);
      if (!p) return;
      this.#pending.delete(msg.id);
      p.resolve(new Uint8Array(msg.bytes));
    } else if (msg.type === 'read-error') {
      const p = this.#pending.get(msg.id);
      if (!p) return;
      this.#pending.delete(msg.id);
      p.reject(new Error(msg.message));
    }
  };
}

/**
 * Range source backed by HTTP Range requests. Used only by the local test
 * harness (python's http.server supports byte ranges).
 */
export class HttpRangeSource implements RangeSource {
  #url: string;
  #size: number;

  private constructor(url: string, size: number) {
    this.#url = url;
    this.#size = size;
  }

  static async create(url: string): Promise<HttpRangeSource> {
    const res = await fetch(url, { method: 'HEAD' });
    const len = Number(res.headers.get('content-length') ?? '0');
    return new HttpRangeSource(url, len);
  }

  size(): number {
    return this.#size;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const end = Math.min(offset + length, this.#size) - 1;
    const res = await fetch(this.#url, {
      headers: { Range: `bytes=${offset}-${end}` },
    });
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }
}
