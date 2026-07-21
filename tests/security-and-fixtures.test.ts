import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectSensitiveText } from "../apps/desktop/main/controller";
import {
  BENCHMARK_FIXTURES,
  CHARACTER_SEQUENCES,
  EDIT_LOCALITY_FIXTURES
} from "@maliang/test-fixtures";
import { sniffImage } from "@maliang/codex-gateway";

describe("security boundaries and benchmark coverage", () => {
  it("preflights common private contact details and secrets locally", () => {
    const text = "Email me at kid@example.com or call 206-555-1212. password: swordfish";
    expect(detectSensitiveText(text).map((finding) => finding.code)).toEqual([
      "EMAIL",
      "PHONE",
      "SECRET"
    ]);
  });

  it("contains every required synthetic benchmark group", () => {
    expect(BENCHMARK_FIXTURES).toHaveLength(120);
    expect(CHARACTER_SEQUENCES).toHaveLength(20);
    expect(CHARACTER_SEQUENCES.every((sequence) => sequence.panels.length === 6)).toBe(true);
    expect(EDIT_LOCALITY_FIXTURES).toHaveLength(30);
  });

  it("accepts only sniffed image bytes, not a filename extension", () => {
    expect(sniffImage(Buffer.from("fake.png"))).toBeNull();
  });

  it("keeps the reviewed craft catalog integrity manifest current", async () => {
    const catalogPath = join(process.cwd(), "packages", "craft-cards", "src", "catalog.ts");
    const manifest = JSON.parse(await readFile(
      join(process.cwd(), "packages", "craft-cards", "catalog.manifest.json"),
      "utf8"
    )) as { sha256: string };
    const digest = createHash("sha256").update(await readFile(catalogPath)).digest("hex");
    expect(digest).toBe(manifest.sha256);
  });
});
