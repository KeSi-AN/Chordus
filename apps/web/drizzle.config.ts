import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
import { findRepoRoot, getServerConfig } from "./src/server/env";

loadEnvConfig(findRepoRoot());
const cfg = getServerConfig();

export default defineConfig({
  dialect: cfg.databaseUrl.startsWith("file:") ? "sqlite" : "turso",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: cfg.databaseUrl, authToken: cfg.databaseAuthToken },
});
