import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LocalStorage } from "./storage";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "chordus-storage-"));
const storage = new LocalStorage(root);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe("LocalStorage", () => {
  it("writes bytes and streams, stats and reads ranges", async () => {
    expect(await storage.put("audio/a/x.txt", new TextEncoder().encode("hello world"))).toEqual({
      size: 11,
    });
    expect(await storage.stat("audio/a/x.txt")).toEqual({ size: 11 });
    expect(await readAll(storage.read("audio/a/x.txt"))).toBe("hello world");
    expect(await readAll(storage.read("audio/a/x.txt", { start: 6, end: 10 }))).toBe("world");

    const stream = new Response("streamed!").body!;
    expect(await storage.put("audio/b/y.txt", stream)).toEqual({ size: 9 });
    expect(await readAll(storage.read("audio/b/y.txt"))).toBe("streamed!");
  });

  it("deletes and reports missing files", async () => {
    await storage.delete("audio/a/x.txt");
    expect(await storage.stat("audio/a/x.txt")).toBeNull();
    await expect(storage.delete("audio/a/missing.txt")).resolves.toBeUndefined();
  });

  it("rejects path traversal", async () => {
    await expect(storage.put("../evil.txt", new Uint8Array())).rejects.toThrow();
    await expect(storage.put("audio/../../evil.txt", new Uint8Array())).rejects.toThrow();
    expect(() => storage.read("C:/windows/system.ini")).toThrow();
  });
});
