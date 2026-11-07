import { STRUM_PRESETS } from "@chordus/core";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../seed/seed";
import { createTestDb, type TestDb } from "../test-utils";
import { chordSheets, songs, strumPatterns, users } from "./schema";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.cleanup());

describe("migrations + seed", () => {
  it("creates the default user, presets and sample songs", async () => {
    expect(await t.db.select().from(users)).toHaveLength(1);
    expect(await t.db.select().from(strumPatterns)).toHaveLength(STRUM_PRESETS.length);
    expect(await t.db.select().from(songs)).toHaveLength(3);
    const sheets = await t.db.select().from(chordSheets);
    expect(sheets.every((s) => s.isPrimary && s.chordpro.includes("{title:"))).toBe(true);
  });

  it("is idempotent", async () => {
    await seedDatabase(t.db);
    expect(await t.db.select().from(songs)).toHaveLength(3);
    expect(await t.db.select().from(strumPatterns)).toHaveLength(STRUM_PRESETS.length);
  });

  it("keeps the FTS index in sync with songs", async () => {
    const search = async (q: string) =>
      (
        await t.db.all<{ id: string }>(
          sql`SELECT s.id FROM songs_fts f JOIN songs s ON s.rowid = f.rowid WHERE songs_fts MATCH ${q}`,
        )
      ).map((r) => r.id);

    expect(await search('"clem"*')).toEqual(["seed-clementine"]);
    await t.db.run(sql`UPDATE songs SET title = 'Darling Clem' WHERE id = 'seed-clementine'`);
    expect(await search('"darling"*')).toEqual(["seed-clementine"]);
    expect(await search('"oh"*')).toEqual([]);
  });
});
