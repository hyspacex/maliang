import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@maliang/domain": `${root}packages/domain/src/index.ts`,
      "@maliang/scene-schema": `${root}packages/scene-schema/src/index.ts`,
      "@maliang/scene-validator": `${root}packages/scene-validator/src/index.ts`,
      "@maliang/render-compiler": `${root}packages/render-compiler/src/index.ts`,
      "@maliang/design-system": `${root}packages/design-system/src/index.ts`,
      "@maliang/coaching-catalog": `${root}packages/coaching-catalog/src/index.ts`,
      "@maliang/craft-cards/catalog": `${root}packages/craft-cards/src/catalog.ts`,
      "@maliang/craft-cards": `${root}packages/craft-cards/src/index.ts`,
      "@maliang/local-store": `${root}packages/local-store/src/index.ts`,
      "@maliang/codex-gateway": `${root}packages/codex-gateway/src/index.ts`,
      "@maliang/image-compositor": `${root}packages/image-compositor/src/index.ts`,
      "@maliang/vector-renderer": `${root}packages/vector-renderer/src/index.ts`,
      "@maliang/test-fixtures": `${root}packages/test-fixtures/src/index.ts`
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      reporter: ["text", "json-summary"]
    }
  }
});
