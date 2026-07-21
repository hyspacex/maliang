import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./renderer", import.meta.url)),
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@maliang/domain": `${repositoryRoot}/packages/domain/src/index.ts`,
      "@maliang/design-system": `${repositoryRoot}/packages/design-system/src/index.ts`,
      "@maliang/coaching-catalog": `${repositoryRoot}/packages/coaching-catalog/src/index.ts`,
      "@maliang/craft-cards/catalog": `${repositoryRoot}/packages/craft-cards/src/catalog.ts`
    }
  },
  build: {
    outDir: `${repositoryRoot}/dist/renderer`,
    emptyOutDir: true,
    sourcemap: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});
