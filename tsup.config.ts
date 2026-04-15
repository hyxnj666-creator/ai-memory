import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    target: "node22",
    outDir: "dist",
    clean: true,
    sourcemap: true,
    define: { __VERSION__: JSON.stringify(version) },
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  {
    entry: { public: "src/public.ts" },
    format: ["esm"],
    target: "node22",
    outDir: "dist",
    sourcemap: true,
    dts: true,
  },
]);
