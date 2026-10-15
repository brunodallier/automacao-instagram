import { build } from "esbuild";
await build({
  entryPoints: ["scripts/automation-worker.ts"],
  outfile: "dist/automation-worker.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "bundle",
  external: ["pg-native"],
  tsconfig: "tsconfig.json",
  sourcemap: false,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
