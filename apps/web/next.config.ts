import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { findRepoRoot } from "./src/server/env";

// Load the repo-root .env so one file configures the web app, scripts and (later) the analyzer.
loadEnvConfig(findRepoRoot());

const nextConfig: NextConfig = {
  // Cache Components is off: every page reads the local DB per request, and its Activity-based
  // navigation keeps hidden routes mounted (which would keep the audio player alive).
  cacheComponents: false,
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
