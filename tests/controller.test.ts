import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CodexGatewayError,
  type CodexCapability,
  type CodexGateway,
  type ComplaintDiagnostic,
  type GeneratedArtifact,
  type PanelEditJob,
  type PanelRenderJob,
  type RenderInspection,
  type RenderInspectionJob,
  type SafetyJob,
  type SafetyResult,
  type SceneExtractionJob,
  type SceneExtractionResult,
  type VectorPlanJob,
  type VectorPlanResult
} from "@maliang/codex-gateway";
import type { SceneGraph } from "@maliang/domain";
import {
  ApplicationController,
  type ControllerEvent
} from "../apps/desktop/main/controller.js";
import {
  InMemoryDataKeyProvider,
  MaliangStore
} from "@maliang/local-store";
import {
  VECTOR_MODEL_POLICY,
  defaultVectorScenePlan
} from "@maliang/vector-renderer";

const roots: string[] = [];
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

function graphFor(job: SceneExtractionJob): SceneGraph {
  const start = job.panelText.indexOf("Mara");
  return {
    schemaVersion: 1,
    sourceHash: job.sourceHash,
    entities: [{
      entityId: "character:mara",
      kind: "character",
      label: {
        value: "Mara",
        evidence: { start, end: start + 4, text: "Mara" }
      },
      attributes: []
    }],
    actions: [],
    setting: {
      place: null,
      time: null,
      weather: null,
      lighting: null,
      objects: []
    },
    internalStates: [],
    dialogue: [],
    sequenceMarkers: [],
    diagnostics: []
  };
}

class CountingGateway implements CodexGateway {
  safetyCalls = 0;
  extractionCalls = 0;
  imageCalls = 0;
  vectorPlanCalls = 0;

  constructor(
    private failNextImage = false,
    private delayNextSafetyMs = 0
  ) {}

  async checkCapability(): Promise<CodexCapability> {
    return {
      ready: true,
      auth: "CHATGPT",
      installedVersion: "0.144.5",
      requiredVersion: ">=0.144.5 <0.146.0",
      textModel: "gpt-5.6-terra",
      imageModelPolicy: "gpt-image-2",
      reason: "READY"
    };
  }

  async extractScene(job: SceneExtractionJob): Promise<SceneExtractionResult> {
    this.extractionCalls++;
    return {
      graph: graphFor(job),
      model: "gpt-5.6-terra",
      gatewayVersion: "test-gateway",
      durationMs: 1
    };
  }

  async classifySafety(job: SafetyJob): Promise<SafetyResult> {
    this.safetyCalls++;
    const delayMs = this.delayNextSafetyMs;
    this.delayNextSafetyMs = 0;
    if (delayMs > 0) {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        const timer = setTimeout(resolvePromise, delayMs);
        const cancel = (): void => {
          clearTimeout(timer);
          rejectPromise(new CodexGatewayError("CANCELLED", "Synthetic cancellation."));
        };
        if (job.signal?.aborted) cancel();
        else job.signal?.addEventListener("abort", cancel, { once: true });
      });
    }
    return {
      action: "ALLOW",
      categories: [],
      model: "gpt-5.6-terra",
      durationMs: 1
    };
  }

  async diagnoseComplaint(): Promise<ComplaintDiagnostic> {
    return {
      code: "RENDER_MISMATCH",
      entityId: null,
      property: null,
      alreadyExpressed: false,
      confidence: "high"
    };
  }

  async planVectorPanel(job: VectorPlanJob): Promise<VectorPlanResult> {
    this.vectorPlanCalls++;
    return {
      plan: defaultVectorScenePlan(job.contract),
      model: "gpt-5.6-terra",
      modelPolicy: VECTOR_MODEL_POLICY,
      gatewayVersion: "test-gateway",
      durationMs: 1
    };
  }

  async generatePanel(_job: PanelRenderJob): Promise<GeneratedArtifact> {
    this.imageCalls++;
    if (this.failNextImage) {
      this.failNextImage = false;
      throw new CodexGatewayError("TIMEOUT", "Synthetic timeout.", true);
    }
    return {
      bytes: png,
      mimeType: "image/png",
      modelPolicy: "gpt-image-2",
      durationMs: 1
    };
  }

  async editPanel(job: PanelEditJob): Promise<GeneratedArtifact> {
    return this.generatePanel(job);
  }

  async inspectPanel(_job: RenderInspectionJob): Promise<RenderInspection> {
    return {
      explicitDetailCoverage: 1,
      unsupportedConcreteDetails: [],
      characterIdentityDrift: 0,
      editLocalityDrift: 0,
      unsafeOrCorrupt: false
    };
  }
}

class DelayedComplaintGateway extends CountingGateway {
  #resolveComplaint: ((value: ComplaintDiagnostic) => void) | null = null;

  override diagnoseComplaint(): Promise<ComplaintDiagnostic> {
    return new Promise((resolvePromise) => {
      this.#resolveComplaint = resolvePromise;
    });
  }

  resolveComplaint(value: ComplaintDiagnostic): void {
    const resolvePromise = this.#resolveComplaint;
    if (!resolvePromise) throw new Error("Complaint diagnosis has not started.");
    this.#resolveComplaint = null;
    resolvePromise(value);
  }
}

async function waitForEvent(
  events: ControllerEvent[],
  predicate: (event: ControllerEvent) => boolean
): Promise<void> {
  await vi.waitFor(() => {
    expect(events.some(predicate)).toBe(true);
  }, { timeout: 3_000 });
}

describe("ApplicationController rendering recovery", () => {
  it("uses the vector plan path without an image-model call when selected", async () => {
    const root = join(tmpdir(), `maliang-controller-${randomUUID()}`);
    roots.push(root);
    const store = await MaliangStore.open({
      rootDirectory: root,
      keyProvider: new InMemoryDataKeyProvider()
    });
    const gateway = new CountingGateway();
    const events: ControllerEvent[] = [];
    const controller = new ApplicationController({
      store,
      gateway,
      rendererMode: "vector",
      emit: (event) => events.push(event)
    });
    await controller.initialize();
    const story = await controller.createStory({
      mode: "AUTHOR",
      title: "Vector",
      authorDisplayName: "Tester"
    });
    const panel = story.panels[0];
    if (!panel) throw new Error("Expected a panel.");
    const revision = await controller.updatePanelText({
      panelId: panel.panelId,
      baseVersion: 0,
      text: "Mara",
      origin: "KEYBOARD"
    });
    await waitForEvent(
      events,
      (event) =>
        event.type === "panel.state" &&
        event.revisionVersion === revision.version &&
        event.state === "partial"
    );
    const readyEvent = events.find(
      (event) =>
        event.type === "panel.state" &&
        event.revisionVersion === revision.version &&
        event.state === "partial"
    );
    expect(readyEvent?.type === "panel.state" ? readyEvent.diagnosticCodes : []).toEqual([
      "GENERIC_OR_MISSING_ACTION",
      "MISSING_APPEARANCE_DETAIL",
      "SETTING_UNDERSPECIFIED"
    ]);
    const restored = await controller.loadStory(story.story.id);
    expect(restored.panels[0]?.diagnosticCodes).toEqual([
      "GENERIC_OR_MISSING_ACTION",
      "MISSING_APPEARANCE_DETAIL",
      "SETTING_UNDERSPECIFIED"
    ]);

    const stored = await store.readStory(story.story.id);
    const artifactId = stored?.panels[0]?.currentArtifactId;
    const artifact = artifactId ? await store.readArtifact(artifactId) : null;
    expect(artifact?.toString("utf8")).toContain('data-renderer="vector"');
    expect(gateway.vectorPlanCalls).toBe(1);
    expect(gateway.imageCalls).toBe(0);
    store.close();
  });

  it("supersedes active work when a newer panel revision arrives", async () => {
    const root = join(tmpdir(), `maliang-controller-${randomUUID()}`);
    roots.push(root);
    const store = await MaliangStore.open({
      rootDirectory: root,
      keyProvider: new InMemoryDataKeyProvider()
    });
    const gateway = new CountingGateway(false, 5_000);
    const events: ControllerEvent[] = [];
    const controller = new ApplicationController({
      store,
      gateway,
      emit: (event) => events.push(event)
    });
    await controller.initialize();
    const story = await controller.createStory({
      mode: "AUTHOR",
      title: "Cancellation",
      authorDisplayName: "Tester"
    });
    const panel = story.panels[0];
    if (!panel) throw new Error("Expected a panel.");
    const first = await controller.updatePanelText({
      panelId: panel.panelId,
      baseVersion: 0,
      text: "Mara",
      origin: "KEYBOARD"
    });
    await vi.waitFor(() => expect(gateway.safetyCalls).toBe(1));
    const second = await controller.updatePanelText({
      panelId: panel.panelId,
      baseVersion: first.version,
      text: "Mara!",
      origin: "KEYBOARD"
    });
    await waitForEvent(
      events,
      (event) =>
        event.type === "panel.state" &&
        event.revisionVersion === second.version &&
        event.state === "partial"
    );

    expect(store.readLatestRenderJob(first.revisionId)).toEqual({
      state: "SUPERSEDED",
      errorCode: null
    });
    expect(store.readLatestRenderJob(second.revisionId)).toEqual({
      state: "READY",
      errorCode: null
    });
    expect(gateway.extractionCalls).toBe(1);
    expect(gateway.imageCalls).toBe(1);
    store.close();
  });

  it("retries a failed image from the persisted compiled stage", async () => {
    const root = join(tmpdir(), `maliang-controller-${randomUUID()}`);
    roots.push(root);
    const store = await MaliangStore.open({
      rootDirectory: root,
      keyProvider: new InMemoryDataKeyProvider()
    });
    const gateway = new CountingGateway(true);
    const events: ControllerEvent[] = [];
    const controller = new ApplicationController({
      store,
      gateway,
      emit: (event) => events.push(event)
    });
    await controller.initialize();
    const story = await controller.createStory({
      mode: "AUTHOR",
      title: "Retry",
      authorDisplayName: "Tester"
    });
    const panel = story.panels[0];
    if (!panel) throw new Error("Expected a panel.");
    const revision = await controller.updatePanelText({
      panelId: panel.panelId,
      baseVersion: 0,
      text: "Mara",
      origin: "KEYBOARD"
    });
    await waitForEvent(
      events,
      (event) =>
        event.type === "panel.state" &&
        event.revisionVersion === revision.version &&
        event.state === "failed"
    );
    expect(gateway.safetyCalls).toBe(1);
    expect(gateway.extractionCalls).toBe(1);
    expect(gateway.imageCalls).toBe(1);

    await controller.retryRender(panel.panelId);

    expect(gateway.safetyCalls).toBe(1);
    expect(gateway.extractionCalls).toBe(1);
    expect(gateway.imageCalls).toBe(2);
    expect(store.readLatestRenderJob(revision.revisionId)).toEqual({
      state: "READY",
      errorCode: null
    });
    store.close();
  });

  it("restores validated state and the raw-image cache after restart", async () => {
    const root = join(tmpdir(), `maliang-controller-${randomUUID()}`);
    roots.push(root);
    const keyProvider = new InMemoryDataKeyProvider();
    let store = await MaliangStore.open({
      rootDirectory: root,
      keyProvider
    });
    const firstGateway = new CountingGateway();
    const firstEvents: ControllerEvent[] = [];
    const firstController = new ApplicationController({
      store,
      gateway: firstGateway,
      emit: (event) => firstEvents.push(event)
    });
    await firstController.initialize();
    const story = await firstController.createStory({
      mode: "AUTHOR",
      title: "Persistent cache",
      authorDisplayName: "Tester"
    });
    const panel = story.panels[0];
    if (!panel) throw new Error("Expected a panel.");
    const revision = await firstController.updatePanelText({
      panelId: panel.panelId,
      baseVersion: 0,
      text: "Mara",
      origin: "KEYBOARD"
    });
    await waitForEvent(
      firstEvents,
      (event) =>
        event.type === "panel.state" &&
        event.revisionVersion === revision.version &&
        event.state === "partial"
    );
    expect(firstGateway.imageCalls).toBe(1);
    store.close();

    store = await MaliangStore.open({ rootDirectory: root, keyProvider });
    const restartedGateway = new CountingGateway();
    const restartedEvents: ControllerEvent[] = [];
    const restartedController = new ApplicationController({
      store,
      gateway: restartedGateway,
      emit: (event) => restartedEvents.push(event)
    });
    await restartedController.initialize();
    const restored = await restartedController.loadStory(story.story.id);
    expect(restored.panels[0]).toMatchObject({
      visualState: "partial",
      revisionVersion: revision.version
    });

    await restartedController.retryRender(panel.panelId);

    expect(restartedGateway.safetyCalls).toBe(0);
    expect(restartedGateway.extractionCalls).toBe(0);
    expect(restartedGateway.imageCalls).toBe(0);
    expect(store.readLatestRenderJob(revision.revisionId)).toEqual({
      state: "READY",
      errorCode: null
    });

    const revisited = await restartedController.updatePanelText({
      panelId: panel.panelId,
      baseVersion: revision.version,
      text: "Mara",
      origin: "KEYBOARD"
    });
    await waitForEvent(
      restartedEvents,
      (event) =>
        event.type === "panel.state" &&
        event.revisionVersion === revisited.version &&
        event.state === "partial"
    );
    expect(restartedGateway.safetyCalls).toBe(0);
    expect(restartedGateway.extractionCalls).toBe(0);
    expect(restartedGateway.imageCalls).toBe(0);
    store.close();
  });

  it("drops a complaint diagnosis when the child has already made a newer edit", async () => {
    const root = join(tmpdir(), `maliang-controller-${randomUUID()}`);
    roots.push(root);
    const store = await MaliangStore.open({
      rootDirectory: root,
      keyProvider: new InMemoryDataKeyProvider()
    });
    const gateway = new DelayedComplaintGateway();
    const events: ControllerEvent[] = [];
    const controller = new ApplicationController({
      store,
      gateway,
      rendererMode: "vector",
      emit: (event) => events.push(event)
    });
    await controller.initialize();
    const story = await controller.createStory({
      mode: "AUTHOR",
      title: "Complaint ordering",
      authorDisplayName: "Tester"
    });
    const panel = story.panels[0];
    if (!panel) throw new Error("Expected a panel.");
    const first = await controller.updatePanelText({
      panelId: panel.panelId,
      baseVersion: 0,
      text: "Mara",
      origin: "KEYBOARD"
    });
    await waitForEvent(
      events,
      (event) =>
        event.type === "panel.state" &&
        event.revisionVersion === first.version &&
        event.state === "partial"
    );

    const pendingDiagnosis = controller.diagnoseComplaint(
      panel.panelId,
      "The picture is not what I imagined."
    );
    const second = await controller.updatePanelText({
      panelId: panel.panelId,
      baseVersion: first.version,
      text: "Mara",
      origin: "KEYBOARD"
    });
    gateway.resolveComplaint({
      code: "MISSING_APPEARANCE_DETAIL",
      entityId: "character:mara",
      property: "appearance",
      alreadyExpressed: false,
      confidence: "high"
    });
    await expect(pendingDiagnosis).resolves.toBeNull();
    await waitForEvent(
      events,
      (event) =>
        event.type === "panel.state" &&
        event.revisionVersion === second.version &&
        event.state === "partial"
    );
    store.close();
  });
});
