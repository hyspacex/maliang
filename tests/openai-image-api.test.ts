import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FixtureCodexGateway,
  loadOpenAIKeyFromEnvFile,
  OpenAIImageApiGateway,
  OPENAI_IMAGE_API_MODEL_POLICY
} from "@maliang/codex-gateway";
import { RenderCompiler } from "@maliang/render-compiler";
import { BENCHMARK_FIXTURES } from "@maliang/test-fixtures";

const roots: string[] = [];
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

function contract() {
  const fixture = BENCHMARK_FIXTURES.find((candidate) => candidate.id === "setting-01");
  if (!fixture) throw new Error("Benchmark fixture missing.");
  return new RenderCompiler().compile(fixture.expectedGraph, {
    styleVersion: "comic-pencil-ink/v1",
    modelPolicyVersion: "openai-api-test/v1"
  });
}

function imageResponse(status = 200, errorCode?: string): Response {
  return new Response(
    JSON.stringify(status === 200
      ? { data: [{ b64_json: jpeg.toString("base64") }] }
      : { error: { code: errorCode ?? "request_failed" } }),
    {
      status,
      headers: { "Content-Type": "application/json" }
    }
  );
}

describe("OpenAIImageApiGateway", () => {
  it("uses the low-latency image settings without putting the key in the body", async () => {
    let requestUrl = "";
    let requestBody = "";
    let authorization = "";
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(input);
      requestBody = String(init?.body);
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return imageResponse();
    }) as typeof fetch;
    const gateway = new OpenAIImageApiGateway({
      delegate: new FixtureCodexGateway(),
      apiKey: "sk-test-redacted",
      fetchImpl
    });

    const artifact = await gateway.generatePanel({
      jobId: "api-generate",
      contract: contract(),
      characterReferencePaths: []
    });
    const body = JSON.parse(requestBody) as Record<string, unknown>;

    expect(requestUrl).toBe("https://api.openai.com/v1/images/generations");
    expect(authorization).toBe("Bearer sk-test-redacted");
    expect(requestBody).not.toContain("sk-test-redacted");
    expect(body).toMatchObject({
      model: "gpt-image-2",
      quality: "low",
      size: "960x720",
      output_format: "jpeg",
      output_compression: 72,
      n: 1
    });
    expect(String(body.prompt)).toContain("untrusted descriptive data");
    expect(String(body.prompt)).toContain("Do not draw any readable words");
    expect(artifact).toMatchObject({
      mimeType: "image/jpeg",
      modelPolicy: OPENAI_IMAGE_API_MODEL_POLICY
    });
  });

  it("uses the edits endpoint and the base image for local revisions", async () => {
    let form: FormData | null = null;
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      form = init?.body instanceof FormData ? init.body : null;
      return imageResponse();
    }) as typeof fetch;
    const gateway = new OpenAIImageApiGateway({
      delegate: new FixtureCodexGateway(),
      apiKey: "sk-test-redacted",
      fetchImpl
    });

    await gateway.editPanel({
      jobId: "api-edit",
      contract: contract(),
      characterReferencePaths: [],
      baseArtifact: {
        bytes: jpeg,
        mimeType: "image/jpeg",
        modelPolicy: "previous",
        durationMs: 1
      },
      changedFactIds: ["fact-1"]
    });

    const submittedForm = form as FormData | null;
    expect(submittedForm).not.toBeNull();
    expect(submittedForm?.get("model")).toBe("gpt-image-2");
    expect(submittedForm?.get("quality")).toBe("low");
    expect(submittedForm?.get("size")).toBe("960x720");
    expect(submittedForm?.getAll("image[]")).toHaveLength(1);
    expect(String(submittedForm?.get("prompt"))).toContain(
      "Change only the listed changedFactIds"
    );
  });

  it.each([
    [401, "invalid_api_key", "AUTH_REQUIRED"],
    [403, "model_not_found", "MODEL_UNAVAILABLE"],
    [429, "insufficient_quota", "USAGE_LIMIT"]
  ])("maps HTTP %i to %s without exposing response details", async (
    status,
    errorCode,
    expectedCode
  ) => {
    const gateway = new OpenAIImageApiGateway({
      delegate: new FixtureCodexGateway(),
      apiKey: "sk-test-redacted",
      fetchImpl: (async () => imageResponse(status, errorCode)) as typeof fetch
    });
    await expect(gateway.generatePanel({
      jobId: "api-error",
      contract: contract(),
      characterReferencePaths: []
    })).rejects.toMatchObject({ code: expectedCode });
  });

  it("loads only OPENAI_API_KEY from the selected ignored env file", async () => {
    const root = join(tmpdir(), `maliang-openai-key-${randomUUID()}`);
    roots.push(root);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const path = join(root, ".env");
    await writeFile(
      path,
      "# local only\nOTHER=value\nOPENAI_API_KEY='sk-test-redacted'\n",
      { mode: 0o600 }
    );
    await expect(loadOpenAIKeyFromEnvFile(path)).resolves.toBe("sk-test-redacted");
  });
});
