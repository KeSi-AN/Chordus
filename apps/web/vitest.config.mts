import { defineProject } from "vitest/config";
import path from "node:path";

export default defineProject({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    name: "web",
    include: ["src/**/*.test.ts", "worklets/**/*.test.ts"],
    environment: "node",
  },
});
