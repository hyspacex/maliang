import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ApplicationController,
  type ControllerEvent,
  type RendererMode
} from "../apps/desktop/main/controller.js";
import {
  CodexSubprocessGateway,
  loadOpenAIKeyFromEnvFile,
  OpenAIImageApiGateway,
  OPENAI_IMAGE_API_MODEL,
  OPENAI_IMAGE_API_OUTPUT_COMPRESSION,
  OPENAI_IMAGE_API_OUTPUT_FORMAT,
  OPENAI_IMAGE_API_QUALITY,
  OPENAI_IMAGE_API_SIZE,
  type CodexGateway
} from "@maliang/codex-gateway";
import { InMemoryDataKeyProvider, MaliangStore } from "@maliang/local-store";
import { BENCHMARK_FIXTURES } from "@maliang/test-fixtures";

if (process.env.MALIANG_LIVE_CODEX !== "1") {
  throw new Error(
    "Product comparison uses live synthetic model work. Set MALIANG_LIVE_CODEX=1."
  );
}

const rendererArgument = process.argv.find((argument) =>
  argument.startsWith("--renderer=")
);
const fixtureArgument = process.argv.find((argument) =>
  argument.startsWith("--fixture=")
);
const renderer = rendererArgument?.split("=")[1] as RendererMode | undefined;
const fixtureId = fixtureArgument?.split("=")[1];
if (renderer !== "raster" && renderer !== "vector" && renderer !== "openai-api") {
  throw new Error("--renderer must be raster, vector, or openai-api.");
}
if (renderer === "openai-api" && process.env.MALIANG_LIVE_OPENAI !== "1") {
  throw new Error(
    "OpenAI API usage is disabled. Set MALIANG_LIVE_OPENAI=1 for the reviewed synthetic run."
  );
}
if (!fixtureId) throw new Error("--fixture is required.");
const fixture = BENCHMARK_FIXTURES.find((candidate) => candidate.id === fixtureId);
if (!fixture) throw new Error(`Unknown fixture: ${fixtureId}`);

const runId =
  `product-${renderer}-${fixture.id}-` +
  `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
const runRoot = join(process.cwd(), "benchmarks", "runs", runId);
const localDataRoot = join(runRoot, "local-data");
const artifactRoot = join(runRoot, "artifacts");
await mkdir(artifactRoot, { recursive: true, mode: 0o700 });

const store = await MaliangStore.open({
  rootDirectory: localDataRoot,
  keyProvider: new InMemoryDataKeyProvider()
});
const codexGateway = new CodexSubprocessGateway({
  jobsRoot: join(runRoot, "jobs")
});
let gateway: CodexGateway = codexGateway;
if (renderer === "openai-api") {
  const apiKey = await loadOpenAIKeyFromEnvFile(
    process.env.MALIANG_OPENAI_ENV_FILE ?? join(process.cwd(), ".env")
  );
  gateway = new OpenAIImageApiGateway({ delegate: codexGateway, apiKey });
}

let targetPanelId = "";
let terminalEvent: Extract<ControllerEvent, { type: "panel.state" }> | null = null;
let resolveTerminal: (() => void) | null = null;
const terminal = new Promise<void>((resolvePromise) => {
  resolveTerminal = resolvePromise;
});
const controller = new ApplicationController({
  store,
  gateway,
  rendererMode: renderer,
  emit: (event) => {
    if (
      event.type === "panel.state" &&
      event.panelId === targetPanelId &&
      event.state !== "drawing"
    ) {
      terminalEvent = event;
      resolveTerminal?.();
    }
  }
});

await controller.initialize();
const story = await controller.createStory({
  mode: "AUTHOR",
  title: `Renderer comparison: ${fixture.id}`,
  authorDisplayName: "Synthetic benchmark"
});
const panel = story.panels[0];
if (!panel) throw new Error("Comparison story did not create a panel.");
targetPanelId = panel.panelId;

const started = performance.now();
const revision = await controller.updatePanelText({
  panelId: panel.panelId,
  baseVersion: panel.revisionVersion,
  text: fixture.sourceText,
  origin: "KEYBOARD"
});
let timeout: ReturnType<typeof setTimeout> | null = null;
await Promise.race([
  terminal,
  new Promise<never>((_resolvePromise, rejectPromise) => {
    timeout = setTimeout(
      () => rejectPromise(new Error("Product comparison timed out.")),
      6 * 60_000
    );
    timeout.unref();
  })
]);
if (timeout) clearTimeout(timeout);
const totalMs = Math.round(performance.now() - started);
const renderJob = store.readLatestRenderJob(revision.revisionId);

const stored = await store.readStory(story.story.id);
const storedPanel = stored?.panels.find((candidate) => candidate.id === panel.panelId);
const artifactId = storedPanel?.currentArtifactId ?? null;
const artifact = artifactId ? await store.readArtifact(artifactId) : null;
if (artifact) {
  await writeFile(
    join(artifactRoot, `${fixture.id}.svg`),
    artifact,
    { mode: 0o600 }
  );
}
const report = {
  schemaVersion: 1,
  runId,
  syntheticOnly: true,
  renderer,
  fixtureId: fixture.id,
  prompt: fixture.sourceText,
  totalMs,
  terminalEvent,
  renderJob,
  artifactRetained: Boolean(artifact),
  ...(renderer === "openai-api" ? {
    imageApi: {
      model: OPENAI_IMAGE_API_MODEL,
      quality: OPENAI_IMAGE_API_QUALITY,
      size: OPENAI_IMAGE_API_SIZE,
      outputFormat: OPENAI_IMAGE_API_OUTPUT_FORMAT,
      outputCompression: OPENAI_IMAGE_API_OUTPUT_COMPRESSION
    }
  } : {})
};
await writeFile(
  join(runRoot, "report.json"),
  JSON.stringify(report, null, 2),
  { mode: 0o600 }
);
store.close();
await rm(localDataRoot, { recursive: true, force: true });
await rm(join(runRoot, "jobs"), { recursive: true, force: true });
console.log(JSON.stringify(report, null, 2));
