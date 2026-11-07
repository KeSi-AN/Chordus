/**
 * DB maintenance CLI: `tsx scripts/db.ts migrate|seed|reset`.
 * Reads DATABASE_URL / DATA_DIR from the repo-root .env (see .env.example).
 */
import { loadEnvConfig } from "@next/env";
import fs from "node:fs";
import { createDb, runMigrations } from "../src/server/db/client";
import { findRepoRoot, getServerConfig } from "../src/server/env";
import { seedDatabase } from "../src/server/seed/seed";

loadEnvConfig(findRepoRoot());

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const cfg = getServerConfig();

  if (cmd === "reset") {
    if (!cfg.databaseUrl.startsWith("file:")) {
      throw new Error("db:reset only works on a local file database");
    }
    const file = cfg.databaseUrl.slice("file:".length);
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      fs.rmSync(file + suffix, { force: true });
    }
    console.log(`Deleted ${file}`);
  }

  const { db, client } = await createDb(cfg.databaseUrl, cfg.databaseAuthToken);
  try {
    if (cmd === "migrate" || cmd === "reset") {
      await runMigrations(db);
      console.log(`Migrated ${cfg.databaseUrl}`);
    }
    if (cmd === "seed" || cmd === "reset") {
      await seedDatabase(db);
      console.log("Seeded default user, strum presets and sample songs");
    }
    if (!["migrate", "seed", "reset"].includes(cmd ?? "")) {
      console.error("Usage: tsx scripts/db.ts migrate|seed|reset");
      process.exitCode = 1;
    }
  } finally {
    client.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
