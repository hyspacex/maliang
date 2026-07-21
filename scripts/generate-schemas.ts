import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderContractJsonSchema } from "@maliang/render-compiler";
import {
  sceneExtractionDraftJsonSchema,
  sceneGraphJsonSchema
} from "@maliang/scene-schema";

const outputs = [
  {
    directory: join(process.cwd(), "packages", "scene-schema", "schemas"),
    name: "scene-extraction-draft.v1.json",
    schema: sceneExtractionDraftJsonSchema()
  },
  {
    directory: join(process.cwd(), "packages", "scene-schema", "schemas"),
    name: "scene-graph.v1.json",
    schema: sceneGraphJsonSchema()
  },
  {
    directory: join(process.cwd(), "packages", "render-compiler", "schemas"),
    name: "render-contract.v1.json",
    schema: renderContractJsonSchema()
  }
];

for (const output of outputs) {
  await mkdir(output.directory, { recursive: true });
  await writeFile(
    join(output.directory, output.name),
    `${JSON.stringify(output.schema, null, 2)}\n`,
    { mode: 0o644 }
  );
}
