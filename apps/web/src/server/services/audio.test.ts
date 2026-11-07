import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_USER_ID as U } from "../constants";
import { LocalStorage } from "../storage";
import { createTestDb, type TestDb } from "../test-utils";
import { attachAudioFile, getAudioSource, mimeTypeFor, parseRange } from "./audio";
import { getSongDetail, NotFoundError, ValidationError } from "./songs";
import { createStrumPattern, listStrumPatterns } from "./strum";

let t: TestDb;
let storage: LocalStorage;
beforeAll(async () => {
  t = await createTestDb();
  storage = new LocalStorage(path.join(t.dir, "data"));
});
afterAll(() => t.cleanup());

describe("parseRange", () => {
  it.each([
    [null, 100, null],
    ["bytes=0-9", 100, { start: 0, end: 9 }],
    ["bytes=90-", 100, { start: 90, end: 99 }],
    ["bytes=-10", 100, { start: 90, end: 99 }],
    ["bytes=50-500", 100, { start: 50, end: 99 }],
    ["bytes=100-", 100, "invalid"],
    ["bytes=5-2", 100, "invalid"],
    ["items=0-1", 100, "invalid"],
    ["bytes=-", 100, "invalid"],
  ])("%s of %i", (header, size, expected) => {
    expect(parseRange(header, size)).toEqual(expected);
  });
});

describe("attachAudioFile", () => {
  it("stores the file and records a source", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], "take 1.mp3", { type: "audio/mpeg" });
    const src = await attachAudioFile(t.db, storage, {
      userId: U,
      songId: "seed-clementine",
      file,
      maxBytes: 1000,
    });
    expect(src).toMatchObject({
      kind: "file",
      originalFilename: "take 1.mp3",
      mimeType: "audio/mpeg",
    });
    expect(src.filePath).toMatch(/^audio\/seed-clementine\/[\w-]+\.mp3$/);
    expect(fs.existsSync(path.join(t.dir, "data", ...src.filePath!.split("/")))).toBe(true);
    expect((await getSongDetail(t.db, U, "seed-clementine")).audio?.id).toBe(src.id);
    expect((await getAudioSource(t.db, U, src.id)).id).toBe(src.id);
    expect(mimeTypeFor(src)).toBe("audio/mpeg");
  });

  it("accepts files by extension when the type is missing", async () => {
    const file = new File([new Uint8Array([1])], "song.FLAC", { type: "" });
    const src = await attachAudioFile(t.db, storage, {
      userId: U,
      songId: "seed-clementine",
      file,
      maxBytes: 1000,
    });
    expect(src.filePath).toMatch(/\.flac$/);
    expect(mimeTypeFor(src)).toBe("audio/flac");
  });

  it("rejects bad uploads", async () => {
    const attach = (file: File, maxBytes = 1000) =>
      attachAudioFile(t.db, storage, { userId: U, songId: "seed-clementine", file, maxBytes });
    await expect(attach(new File([], "a.mp3", { type: "audio/mpeg" }))).rejects.toThrow(
      ValidationError,
    );
    await expect(attach(new File(["x"], "a.txt", { type: "text/plain" }))).rejects.toThrow(
      ValidationError,
    );
    await expect(attach(new File(["xx"], "a.mp3", { type: "audio/mpeg" }), 1)).rejects.toThrow(
      /larger/,
    );
    await expect(getAudioSource(t.db, U, "nope")).rejects.toThrow(NotFoundError);
  });
});

describe("strum patterns", () => {
  it("lists presets and creates validated user patterns", async () => {
    const before = await listStrumPatterns(t.db, U);
    expect(before.every((p) => p.isPreset)).toBe(true);
    const p = await createStrumPattern(t.db, U, {
      name: "Mine",
      timeSignature: "4/4",
      subdivision: 8,
      pattern: "d-du-udu",
    });
    expect(p).toMatchObject({ pattern: "D-DU-UDU", isPreset: false, userId: U });
    expect(await listStrumPatterns(t.db, U)).toHaveLength(before.length + 1);
    await expect(
      createStrumPattern(t.db, U, {
        name: "Bad",
        timeSignature: "3/4",
        subdivision: 8,
        pattern: "D",
      }),
    ).rejects.toThrow(ValidationError);
  });
});
