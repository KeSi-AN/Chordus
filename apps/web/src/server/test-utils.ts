import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDb, runMigrations, type DbHandle } from "./db/client";
import { seedDatabase, type SeedOptions } from "./seed/seed";

export interface TestDb extends DbHandle {
  dir: string;
  cleanup: () => void;
}

/** Fresh, migrated, seeded SQLite file DB in a temp folder. Call `cleanup()` when done. */
export async function createTestDb(seed: SeedOptions = {}): Promise<TestDb> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chordus-test-"));
  const file = path.join(dir, "test.db").split(path.sep).join("/");
  const handle = await createDb(`file:${file}`);
  await runMigrations(handle.db);
  await seedDatabase(handle.db, seed);
  return {
    ...handle,
    dir,
    cleanup: () => {
      handle.client.close();
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // Windows can keep the SQLite file locked briefly after close; the OS temp dir is fine.
      }
    },
  };
}
