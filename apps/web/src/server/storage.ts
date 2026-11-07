import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getServerConfig } from "./env";

export interface ByteRange {
  start: number;
  /** Inclusive end offset. */
  end: number;
}

/**
 * File storage behind an interface so hosting can swap LocalStorage for Vercel Blob / R2.
 * Keys are forward-slash relative paths like `audio/<songId>/<uuid>.mp3`.
 */
export interface Storage {
  put(key: string, data: Uint8Array | ReadableStream<Uint8Array>): Promise<{ size: number }>;
  stat(key: string): Promise<{ size: number } | null>;
  /** Read the whole object or a byte range as a web stream. */
  read(key: string, range?: ByteRange): ReadableStream<Uint8Array>;
  delete(key: string): Promise<void>;
}

export class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!/^[\w./-]+$/.test(key) || key.split("/").includes("..")) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    const full = path.resolve(this.root, ...key.split("/"));
    if (!full.startsWith(path.resolve(this.root) + path.sep)) {
      throw new Error(`Storage key escapes root: ${key}`);
    }
    return full;
  }

  async put(key: string, data: Uint8Array | ReadableStream<Uint8Array>): Promise<{ size: number }> {
    const file = this.resolve(key);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    if (data instanceof Uint8Array) {
      await fsp.writeFile(file, data);
      return { size: data.byteLength };
    }
    const out = fs.createWriteStream(file);
    let size = 0;
    const reader = data.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (!out.write(value)) await new Promise((r) => out.once("drain", r));
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        out.end((err?: Error | null) => (err ? reject(err) : resolve())),
      );
    }
    return { size };
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      const s = await fsp.stat(this.resolve(key));
      return s.isFile() ? { size: s.size } : null;
    } catch {
      return null;
    }
  }

  read(key: string, range?: ByteRange): ReadableStream<Uint8Array> {
    const stream = fs.createReadStream(
      this.resolve(key),
      range ? { start: range.start, end: range.end } : {},
    );
    return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
  }

  async delete(key: string): Promise<void> {
    await fsp.rm(this.resolve(key), { force: true });
  }
}

let storage: Storage | null = null;

export function getStorage(): Storage {
  storage ??= new LocalStorage(getServerConfig().dataDir);
  return storage;
}
