import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CodexSubprocessGateway,
  FixtureCodexGateway,
  loadOpenAIKeyFromEnvFile,
  OpenAIImageApiGateway,
  OPENAI_IMAGE_API_MODEL,
  OPENAI_IMAGE_API_OUTPUT_COMPRESSION,
  OPENAI_IMAGE_API_OUTPUT_FORMAT,
  OPENAI_IMAGE_API_QUALITY,
  OPENAI_IMAGE_API_SIZE,
  type CodexGateway
} from "@maliang/codex-gateway";
import { MALIANG_BRAND } from "@maliang/domain";
import { composePanelSvg } from "@maliang/image-compositor";
import { RenderCompiler } from "@maliang/render-compiler";
import { SceneValidator } from "@maliang/scene-validator";
import {
  BENCHMARK_FIXTURES,
  fixtureSceneMap
} from "@maliang/test-fixtures";
import {
  VECTOR_MODEL_POLICY,
  inspectVectorPanelSvg,
  renderVectorPanelSvg
} from "@maliang/vector-renderer";

const providerArgument = process.argv.find((argument) => argument.startsWith("--provider="));
const providerName = providerArgument?.split("=")[1] ?? "fake";
const rendererArgument = process.argv.find((argument) => argument.startsWith("--renderer="));
const rendererName = rendererArgument?.split("=")[1] ?? "raster";
if (
  rendererName !== "raster" &&
  rendererName !== "vector" &&
  rendererName !== "openai-api"
) {
  throw new Error("--renderer must be raster, vector, or openai-api.");
}
const live = providerName === "codex";
if (live && process.env.MALIANG_LIVE_CODEX !== "1") {
  throw new Error(
    "Live model usage is disabled. Set MALIANG_LIVE_CODEX=1 after reviewing the synthetic-only run."
  );
}
if (rendererName === "openai-api" && !live) {
  throw new Error("The openai-api renderer requires --provider=codex for live text stages.");
}
if (rendererName === "openai-api" && process.env.MALIANG_LIVE_OPENAI !== "1") {
  throw new Error(
    "OpenAI API usage is disabled. Set MALIANG_LIVE_OPENAI=1 for the reviewed synthetic run."
  );
}

const requestedLimit = Number(process.env.MALIANG_BENCHMARK_LIMIT ?? (live ? "5" : "120"));
if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
  throw new Error("MALIANG_BENCHMARK_LIMIT must be a positive integer.");
}
const requestedFixtureId = process.env.MALIANG_BENCHMARK_FIXTURE_ID;
const fixtures = requestedFixtureId
  ? BENCHMARK_FIXTURES.filter((fixture) => fixture.id === requestedFixtureId)
  : BENCHMARK_FIXTURES.slice(0, requestedLimit);
if (requestedFixtureId && fixtures.length === 0) {
  throw new Error(`Unknown MALIANG_BENCHMARK_FIXTURE_ID: ${requestedFixtureId}`);
}
const runId = `run-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
const runRoot = join(process.cwd(), "benchmarks", "runs", runId);
const artifactRoot = join(runRoot, "artifacts");
await mkdir(artifactRoot, { recursive: true, mode: 0o700 });

const baseGateway: CodexGateway = live
  ? new CodexSubprocessGateway({ jobsRoot: join(runRoot, "jobs") })
  : new FixtureCodexGateway(fixtureSceneMap());
let gateway = baseGateway;
if (rendererName === "openai-api") {
  const apiKey = await loadOpenAIKeyFromEnvFile(
    process.env.MALIANG_OPENAI_ENV_FILE ?? join(process.cwd(), ".env")
  );
  gateway = new OpenAIImageApiGateway({ delegate: baseGateway, apiKey });
}
const validator = new SceneValidator();
const compiler = new RenderCompiler();
const stageLatency = {
  total: [] as number[],
  extraction: [] as number[],
  validation: [] as number[],
  compilation: [] as number[],
  planning: [] as number[],
  generation: [] as number[],
  composition: [] as number[]
};
let validCount = 0;
let explicitExpected = 0;
let explicitObserved = 0;
let dialogueExact = 0;
let dialogueTotal = 0;
let feelingRestraintPass = 0;
let feelingRestraintTotal = 0;
let renderedDetailCoverage = 0;
let renderedPencilCompliance = 0;
let renderedUnsupportedConcreteness = 0;
let renderedQualityCount = 0;
const failures: { fixtureId: string; stage: string; code: string }[] = [];

for (const fixture of fixtures) {
  const totalStarted = performance.now();
  try {
    const extracted = await gateway.extractScene({
      jobId: fixture.id,
      panelText: fixture.sourceText,
      sourceHash: fixture.expectedGraph.sourceHash,
      knownEntities: []
    });
    stageLatency.extraction.push(extracted.durationMs);

    const validationStarted = performance.now();
    const validated = validator.validate(fixture.sourceText, extracted.graph);
    stageLatency.validation.push(Math.round(performance.now() - validationStarted));
    if (!validated.valid || !validated.graph) {
      failures.push({ fixtureId: fixture.id, stage: "validation", code: "INVALID_SCENE" });
      continue;
    }
    validCount++;

    const compileStarted = performance.now();
    const contract = compiler.compile(validated.graph, {
      styleVersion: "comic-pencil-ink/v1",
      modelPolicyVersion:
        rendererName === "vector"
          ? VECTOR_MODEL_POLICY
          : rendererName === "openai-api"
            ? MALIANG_BRAND.openAIImageApiModelPolicyVersion
            : MALIANG_BRAND.rasterModelPolicyVersion
    });
    stageLatency.compilation.push(Math.round(performance.now() - compileStarted));
    const expectedContract = compiler.compile(fixture.expectedGraph, {
      styleVersion: "comic-pencil-ink/v1",
      modelPolicyVersion: "codex-gpt-5.6-terra+sol-imagegen-gpt-image-2/v3"
    });
    explicitExpected += expectedContract.explicitFacts.length;
    const expectedFacts = new Set(
      expectedContract.explicitFacts.map((fact) => `${fact.entityId}:${fact.slot}:${fact.value}`)
    );
    explicitObserved += contract.explicitFacts.filter((fact) =>
      expectedFacts.has(`${fact.entityId}:${fact.slot}:${fact.value}`)
    ).length;

    if (fixture.category === "feeling-restraint") {
      feelingRestraintTotal++;
      const inferred = contract.explicitFacts.some((fact) =>
        ["pose", "facial_expression", "movement"].includes(fact.slot)
      );
      if (!inferred) feelingRestraintPass++;
    }
    dialogueTotal += expectedContract.dialogueOverlay.length;
    dialogueExact += contract.dialogueOverlay.filter(
      (dialogue, index) =>
        dialogue.exactText === expectedContract.dialogueOverlay[index]?.exactText
    ).length;

    let composed: Buffer;
    if (rendererName === "vector") {
      const planned = await gateway.planVectorPanel({
        jobId: `${fixture.id}-vector-plan`,
        contract
      });
      stageLatency.planning.push(planned.durationMs);
      const renderStarted = performance.now();
      composed = renderVectorPanelSvg({ contract, plan: planned.plan });
      stageLatency.generation.push(Math.round(performance.now() - renderStarted));
      stageLatency.composition.push(0);
      const quality = inspectVectorPanelSvg(contract, composed);
      renderedDetailCoverage += quality.explicitDetailCoverage;
      renderedPencilCompliance += quality.pencilCompliance;
      renderedUnsupportedConcreteness += quality.unsupportedConcretenessRate;
      renderedQualityCount++;
    } else {
      const artifact = await gateway.generatePanel({
        jobId: `${fixture.id}-render`,
        contract,
        characterReferencePaths: []
      });
      stageLatency.generation.push(artifact.durationMs);
      const composeStarted = performance.now();
      composed = composePanelSvg({
        artBytes: artifact.bytes,
        dialogue: contract.dialogueOverlay
      });
      stageLatency.composition.push(Math.round(performance.now() - composeStarted));
    }
    if (!live || process.env.MALIANG_KEEP_BENCHMARK_ARTIFACTS === "1") {
      await writeFile(join(artifactRoot, `${fixture.id}.svg`), composed, { mode: 0o600 });
    }
    stageLatency.total.push(Math.round(performance.now() - totalStarted));
  } catch (error) {
    const code = error instanceof Error ? error.name : "UNKNOWN";
    failures.push({ fixtureId: fixture.id, stage: "pipeline", code });
  }
}

function percentile(values: readonly number[], amount: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * amount) - 1);
  return sorted[index] ?? null;
}

const latency = Object.fromEntries(
  Object.entries(stageLatency).map(([stage, values]) => [
    stage,
    {
      p50: percentile(values, 0.5),
      p90: percentile(values, 0.9),
      p95: percentile(values, 0.95)
    }
  ])
);
const report = {
  schemaVersion: 1,
  runId,
  provider: providerName,
  renderer: rendererName,
  syntheticOnly: true,
  fixtureCount: fixtures.length,
  categoryCounts: Object.fromEntries(
    [...new Set(fixtures.map((fixture) => fixture.category))].map((category) => [
      category,
      fixtures.filter((fixture) => fixture.category === category).length
    ])
  ),
  metrics: {
    schemaValidity: fixtures.length === 0 ? 0 : validCount / fixtures.length,
    explicitDetailRecall: explicitExpected === 0 ? 0 : explicitObserved / explicitExpected,
    dialogueAccuracy: dialogueTotal === 0 ? 1 : dialogueExact / dialogueTotal,
    feelingRestraint:
      feelingRestraintTotal === 0 ? 1 : feelingRestraintPass / feelingRestraintTotal,
    renderedExplicitDetailCoverage:
      renderedQualityCount === 0 ? null : renderedDetailCoverage / renderedQualityCount,
    unsupportedConcretenessRate:
      renderedQualityCount === 0
        ? null
        : renderedUnsupportedConcreteness / renderedQualityCount,
    pencilCompliance:
      renderedQualityCount === 0 ? null : renderedPencilCompliance / renderedQualityCount,
    clutterHonesty: null,
    characterConsistency: null,
    editLocality: null,
    humanRatingStatus:
      "Not measured by fixture conformance. Use benchmarks/ratings on retained synthetic artifacts."
  },
  usage: {
    textExtractionJobs: fixtures.length,
    vectorPlanningJobs: rendererName === "vector" ? fixtures.length : 0,
    imageJobs: rendererName === "vector" ? 0 : fixtures.length,
    safetyJobs: 0,
    retries: 0
  },
  latency,
  failures,
  ...(rendererName === "openai-api" ? {
    imageApi: {
      model: OPENAI_IMAGE_API_MODEL,
      quality: OPENAI_IMAGE_API_QUALITY,
      size: OPENAI_IMAGE_API_SIZE,
      outputFormat: OPENAI_IMAGE_API_OUTPUT_FORMAT,
      outputCompression: OPENAI_IMAGE_API_OUTPUT_COMPRESSION
    }
  } : {})
};
await writeFile(join(runRoot, "report.json"), JSON.stringify(report, null, 2), {
  mode: 0o600
});
if (process.env.MALIANG_KEEP_BENCHMARK_ARTIFACTS !== "1") {
  await rm(artifactRoot, { recursive: true, force: true });
  await rm(join(runRoot, "jobs"), { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));
