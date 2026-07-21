import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderContractJsonSchema } from "@maliang/render-compiler";
import {
  sceneExtractionDraftJsonSchema,
  sceneGraphJsonSchema
} from "@maliang/scene-schema";

describe("versioned JSON Schemas", () => {
  it("keeps generated scene and render schemas in sync with source", async () => {
    const scene = JSON.parse(await readFile(
      join(process.cwd(), "packages", "scene-schema", "schemas", "scene-graph.v1.json"),
      "utf8"
    ));
    const extraction = JSON.parse(await readFile(
      join(
        process.cwd(),
        "packages",
        "scene-schema",
        "schemas",
        "scene-extraction-draft.v1.json"
      ),
      "utf8"
    ));
    const render = JSON.parse(await readFile(
      join(
        process.cwd(),
        "packages",
        "render-compiler",
        "schemas",
        "render-contract.v1.json"
      ),
      "utf8"
    ));
    expect(scene).toEqual(sceneGraphJsonSchema());
    expect(extraction).toEqual(sceneExtractionDraftJsonSchema());
    expect(render).toEqual(renderContractJsonSchema());
  });
});
