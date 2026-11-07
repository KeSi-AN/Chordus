import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "node:path";

// Load the repo-root .env so one file configures the web app, scripts and the analyzer.
// (Resolved here rather than importing src/server/env.ts: modules imported by next.config
// are not hot-reloaded, which left the app running stale config code.)
loadEnvConfig(path.resolve(process.cwd(), "../.."));

const nextConfig: NextConfig = {
  // Cache Components is off: every page reads the local DB per request, and its Activity-based
  // navigation keeps hidden routes mounted (which would keep the audio player alive).
  cacheComponents: false,
  // Let the dev server be opened from LAN addresses (e.g. http://192.168.x.x:3000 on a phone).
  // Without this, Next blocks its dev scripts for those origins and the page never hydrates.
  allowedDevOrigins: [
    "127.0.0.1",
    "192.168.*.*",
    "10.*.*.*",
    "*.local",
    ...(process.env.ALLOWED_DEV_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? []),
  ],
  transpilePackages: ["@chordus/core"],
  serverExternalPackages: ["@libsql/client", "libsql"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
