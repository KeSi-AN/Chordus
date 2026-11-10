import path from "node:path";
import { eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_USER_ID as U } from "../constants";
import { analyses, jobs, sources } from "../db/schema";
import { LocalStorage } from "../storage";
import { createTestDb, type TestDb } from "../test-utils";
import {
  analyzeSong,
  getAnalysis,
  importFromFile,
  importFromYouTube,
  latestAnalysis,
  latestTimeline,
} from "./analysis";
import { getSongDetail, ValidationError } from "./songs";

let t: TestDb;
let storage: LocalStorage;
beforeAll(async () => {
  t = await createTestDb();
  storage = new LocalStorage(path.join(t.dir, "data"));
});
afterAll(() => t.cleanup());

describe("importFromYouTube", () => {
  it("creates a song, a YouTube source and a queued job", async () => {
    const r = await importFromYouTube(t.db, { userId: U, url: "https://youtu.be/dQw4w9WgXcQ" });
    expect(r.existing).toBe(false);
    expect(r.analysis).toMatchObject({ status: "queued", progress: 0 });
    const detail = await getSongDetail(t.db, U, r.songId);
    expect(detail.song.title).toBe("Untitled (YouTube)");
    expect(detail.sources[0]).toMatchObject({ kind: "youtube", youtubeVideoId: "dQw4w9WgXcQ" });
    expect(detail.audio).toBeNull(); // nothing playable until the worker downloads it

    const [job] = await t.db.select().from(jobs);
    expect(job).toMatchObject({ type: "analyze", status: "queued" });
    expect(job!.payload).toEqual({
      analysisId: r.analysis!.id,
      songId: r.songId,
      sourceId: detail.sources[0]!.id,
    });
  });

  it("returns the existing song for a video already in the library", async () => {
    const r = await importFromYouTube(t.db, {
      userId: U,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10",
    });
    expect(r.existing).toBe(true);
    expect(await t.db.select().from(jobs)).toHaveLength(1);
  });

  it("rejects non-YouTube links", async () => {
    await expect(
      importFromYouTube(t.db, { userId: U, url: "https://vimeo.com/1" }),
    ).rejects.toThrow(ValidationError);
  });
});

describe("importFromFile", () => {
  it("stores the file and queues analysis, titled after the file", async () => {
    const file = new File([new Uint8Array(64)], "my_take.mp3", { type: "audio/mpeg" });
    const r = await importFromFile(t.db, storage, { userId: U, file, maxBytes: 1000 });
    const detail = await getSongDetail(t.db, U, r.songId);
    expect(detail.song.title).toBe("my take");
    expect(detail.audio?.kind).toBe("file");
    expect(r.analysis?.sourceId).toBe(detail.audio?.id);
  });

  it("does not leave an empty song behind when the upload is rejected", async () => {
    const before = (await t.db.select().from(sources)).length;
    const file = new File(["x"], "notes.txt", { type: "text/plain" });
    await expect(
      importFromFile(t.db, storage, { userId: U, file, maxBytes: 1000 }),
    ).rejects.toThrow(ValidationError);
    expect((await t.db.select().from(sources)).length).toBe(before);
  });
});

describe("analyzeSong / progress", () => {
  it("refuses while an analysis is running, then re-queues", async () => {
    const file = new File([new Uint8Array(8)], "a.wav", { type: "audio/wav" });
    const { songId, analysis } = await importFromFile(t.db, storage, {
      userId: U,
      file,
      maxBytes: 1000,
    });
    await expect(analyzeSong(t.db, U, songId)).rejects.toThrow(/already in progress/);

    await t.db
      .update(analyses)
      .set({ status: "done", stage: "Done", progress: 1 })
      .where(eq(analyses.id, analysis!.id));
    expect(await getAnalysis(t.db, U, analysis!.id)).toMatchObject({ status: "done", progress: 1 });

    const again = await analyzeSong(t.db, U, songId);
    expect(again.status).toBe("queued");
    expect((await latestAnalysis(t.db, songId))?.id).toBe(again.id);
  });

  it("needs audio or a YouTube source", async () => {
    await expect(analyzeSong(t.db, U, "seed-clementine")).rejects.toThrow(/Attach audio/);
  });
});

describe("latestTimeline", () => {
  const timeline = (chord: string) => [{ start: 0, end: 2, chord, confidence: 0.9 }];

  it("follows the newest analysis that has produced a timeline", async () => {
    const file = new File([new Uint8Array(8)], "b.wav", { type: "audio/wav" });
    const first = await importFromFile(t.db, storage, { userId: U, file, maxBytes: 1000 });
    const { songId } = first;
    expect(await latestTimeline(t.db, songId)).toBeNull();

    // The draft timeline is usable while the analysis is still running (lyrics come later).
    await t.db
      .update(analyses)
      .set({ status: "running", chordTimeline: timeline("G") })
      .where(eq(analyses.id, first.analysis!.id));
    expect(await latestTimeline(t.db, songId)).toMatchObject({
      analysisId: first.analysis!.id,
      sourceId: first.analysis!.sourceId,
      entries: timeline("G"),
    });

    // A re-analysis that has not got to the chords yet, or failed before them, changes nothing.
    await t.db.update(analyses).set({ status: "done" }).where(eq(analyses.id, first.analysis!.id));
    const again = await analyzeSong(t.db, U, songId);
    expect((await latestTimeline(t.db, songId))?.analysisId).toBe(first.analysis!.id);
    await t.db.update(analyses).set({ status: "failed" }).where(eq(analyses.id, again.id));
    expect((await latestTimeline(t.db, songId))?.entries).toEqual(timeline("G"));

    // Once a newer analysis has chords, its sheet is the one on screen.
    const third = await analyzeSong(t.db, U, songId);
    await t.db
      .update(analyses)
      .set({ status: "running", chordTimeline: timeline("D") })
      .where(eq(analyses.id, third.id));
    expect((await latestTimeline(t.db, songId))?.entries).toEqual(timeline("D"));
  });

  it("is not part of the polled analysis view", async () => {
    const [row] = await t.db.select().from(analyses).where(isNotNull(analyses.chordTimeline));
    const view = await getAnalysis(t.db, U, row!.id);
    expect(view).not.toBeNull();
    expect(view).not.toHaveProperty("chordTimeline");
  });
});
