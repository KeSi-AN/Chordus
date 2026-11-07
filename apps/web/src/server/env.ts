import fs from "node:fs";
import path from "node:path";

/** Walk up from `start` until a directory containing pnpm-workspace.yaml is found. */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

export interface ServerConfig {
  /** libSQL URL: `file:/abs/path/app.db` locally, `libsql://...` for Turso. */
  databaseUrl: string;
  databaseAuthToken: string | undefined;
  /** Root folder for local file storage (audio uploads). */
  dataDir: string;
  /** Max upload size for audio files, in bytes. */
  maxUploadBytes: number;
}

/** Resolve a `file:` URL with a relative path against the repo root, so cwd doesn't matter. */
function resolveFileUrl(url: string, root: string): string {
  if (!url.startsWith("file:")) return url;
  const p = url.slice("file:".length);
  if (p === ":memory:" || path.isAbsolute(p)) return url;
  return `file:${path.resolve(root, p).split(path.sep).join("/")}`;
}

export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const root = findRepoRoot();
  const dataDir = path.resolve(root, env.DATA_DIR ?? "data");
  const databaseUrl = resolveFileUrl(env.DATABASE_URL ?? "file:./data/app.db", root);
  return {
    databaseUrl,
    databaseAuthToken: env.DATABASE_AUTH_TOKEN || undefined,
    dataDir,
    maxUploadBytes: Number(env.MAX_UPLOAD_MB ?? 100) * 1024 * 1024,
  };
}
