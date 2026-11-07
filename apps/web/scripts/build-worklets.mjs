// Bundle AudioWorklet processors (with their dependencies) into public/worklets/.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");

const options = {
  entryPoints: [path.join(root, "worklets/pitch-shift-processor.ts")],
  outdir: path.join(root, "public/worklets"),
  bundle: true,
  format: "iife",
  target: "es2022",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
};

if (watch) {
  const { context } = await import("esbuild");
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
