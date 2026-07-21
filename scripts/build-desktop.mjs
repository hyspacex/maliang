import { rm } from "node:fs/promises";
import { build } from "esbuild";

const outdir = "dist/desktop";
await rm(outdir, { recursive: true, force: true });

await Promise.all([
  build({
    entryPoints: ["apps/desktop/main/index.ts"],
    outfile: `${outdir}/main.mjs`,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["electron", "node:sqlite"],
    sourcemap: true,
    packages: "bundle"
  }),
  build({
    entryPoints: ["apps/desktop/preload/index.ts"],
    outfile: `${outdir}/preload.cjs`,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    sourcemap: true,
    packages: "bundle"
  })
]);
