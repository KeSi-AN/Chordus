import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import fs from "node:fs";
import path from "node:path";
import { findRepoRoot, getServerConfig } from "../env";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  client: Client;
}

/** Create a DB handle for a libSQL URL (local `file:` path or a Turso URL). */
export async function createDb(url: string, authToken?: string): Promise<DbHandle> {
  if (url.startsWith("file:") && !url.includes(":memory:")) {
    fs.mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
  }
  const client = createClient({ url, authToken });
  await client.execute("PRAGMA foreign_keys = ON");
  if (url.startsWith("file:")) await client.execute("PRAGMA busy_timeout = 5000");
  return { db: drizzle(client, { schema }), client };
}

export function migrationsFolder(): string {
  return path.join(findRepoRoot(), "apps", "web", "drizzle");
}

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}

const globalForDb = globalThis as unknown as { __chordusDb?: Promise<DbHandle> };

/** Process-wide DB handle (cached across Next.js dev hot reloads). */
export function getDbHandle(): Promise<DbHandle> {
  if (!globalForDb.__chordusDb) {
    const cfg = getServerConfig();
    globalForDb.__chordusDb = createDb(cfg.databaseUrl, cfg.databaseAuthToken);
  }
  return globalForDb.__chordusDb;
}

export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}
