import { randomUUID } from "node:crypto";
import type {
  ChildSafeCapabilityView,
  ComplaintDiagnosisView,
  CraftCardAward,
  CraftDeckView,
  CreateStoryInput,
  DiagnosticCode,
  PanelRevision,
  PanelRevisionView,
  PanelVisualState,
  SceneGraph,
  Story,
  StoryPanelView,
  StoryView,
  UpdatePanelTextInput
} from "@maliang/domain";
import {
  deriveWritingDiagnostics,
  revisionCoachingCodes
} from "@maliang/coaching-catalog";
import {
  MALIANG_BRAND,
  RevisionGuard,
  TERMINAL_RENDER_JOB_STATES,
  transitionRenderJob,
  type RenderJob,
  type RenderJobState
} from "@maliang/domain";
import {
  CodexGatewayError,
  sniffImage,
  type CodexGateway,
  type GeneratedArtifact
} from "@maliang/codex-gateway";
import { composePanelSvg } from "@maliang/image-compositor";
import type { MaliangStore, StoredStory } from "@maliang/local-store";
import {
  COMPILER_VERSION,
  RenderCompiler,
  chooseRenderPlan,
  hashRenderContract,
  hashVisualRenderContract,
  type RenderContract
} from "@maliang/render-compiler";
import {
  VECTOR_MODEL_POLICY,
  renderVectorPanelSvg,
  type VectorScenePlan
} from "@maliang/vector-renderer";
import { RewardEngine } from "@maliang/craft-cards";
import {
  hashSource,
  meaningfulSceneEvidence,
  SceneValidator,
  unmappedSceneEvidence
} from "@maliang/scene-validator";

const STORY_SPINE = [
  "WHO & WHERE",
  "UH-OH!",
  "TRY #1",
  "TRY #2",
  "THE BIG MOMENT",
  "THE END"
] as const;

export type ControllerEvent =
  | {
      type: "panel.state";
      panelId: string;
      revisionVersion: number;
      state: PanelVisualState;
      artifactUrl: string | null;
      diagnosticCode: DiagnosticCode | null;
      diagnosticCodes: DiagnosticCode[];
      errorCode?: string;
    }
  | {
      type: "card.earned";
      award: CraftCardAward;
    };

export interface ApplicationControllerOptions {
  store: MaliangStore;
  gateway: CodexGateway;
  emit: (event: ControllerEvent) => void;
  rendererMode?: RendererMode;
  now?: () => Date;
}

export type RendererMode = "raster" | "vector" | "openai-api";

interface PanelRuntime {
  storyId: string;
  revisionId: string | null;
  version: number;
  state: PanelVisualState;
  sourceText: string;
  artifactId: string | null;
  graph: ReturnType<SceneValidator["validate"]>["graph"];
  contract: RenderContract | null;
  rawArtifact: GeneratedArtifact | null;
  diagnostics: DiagnosticCode[];
}

interface ProcessRevisionOptions {
  signal: AbortSignal;
  resume?: {
    graph: SceneGraph;
    contract: RenderContract;
  };
}

class Semaphore {
  #available: number;
  readonly #waiters: (() => void)[] = [];

  constructor(capacity: number) {
    this.#available = capacity;
  }

  async use<T>(work: () => Promise<T>): Promise<T> {
    await this.#acquire();
    try {
      return await work();
    } finally {
      this.#release();
    }
  }

  #acquire(): Promise<void> {
    if (this.#available > 0) {
      this.#available--;
      return Promise.resolve();
    }
    return new Promise((resolvePromise) => this.#waiters.push(resolvePromise));
  }

  #release(): void {
    const next = this.#waiters.shift();
    if (next) next();
    else this.#available++;
  }
}

export interface SensitiveTextFinding {
  code: "EMAIL" | "PHONE" | "ADDRESS" | "SECRET";
  start: number;
  end: number;
}

const SENSITIVE_PATTERNS: readonly {
  code: SensitiveTextFinding["code"];
  pattern: RegExp;
}[] = [
  {
    code: "EMAIL",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu
  },
  {
    code: "PHONE",
    pattern: /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}(?!\d)/gu
  },
  {
    code: "ADDRESS",
    pattern: /\b\d{1,6}\s+[\p{L}\d.'-]+(?:\s+[\p{L}\d.'-]+){0,4}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr)\b/giu
  },
  {
    code: "SECRET",
    pattern: /\b(?:password|passcode|api[_ -]?key)\s*[:=]\s*\S+/giu
  }
];

export function detectSensitiveText(text: string): SensitiveTextFinding[] {
  return SENSITIVE_PATTERNS.flatMap(({ code, pattern }) => {
    pattern.lastIndex = 0;
    return [...text.matchAll(pattern)].map((match) => ({
      code,
      start: match.index,
      end: match.index + match[0].length
    }));
  }).sort((a, b) => a.start - b.start);
}

function stateForContract(contract: RenderContract): PanelVisualState {
  if (contract.explicitFacts.length === 0) return "pencil";
  if (contract.pencilSlots.length === 0) return "inked";
  return "partial";
}

export class ApplicationController {
  readonly #store: MaliangStore;
  readonly #gateway: CodexGateway;
  readonly #emit: (event: ControllerEvent) => void;
  readonly #rendererMode: RendererMode;
  readonly #now: () => Date;
  readonly #validator = new SceneValidator();
  readonly #compiler = new RenderCompiler();
  readonly #rewardEngine = new RewardEngine();
  readonly #revisions = new RevisionGuard();
  readonly #extraction = new Semaphore(2);
  readonly #images = new Semaphore(1);
  readonly #panels = new Map<string, PanelRuntime>();
  readonly #renderCache = new Map<string, GeneratedArtifact>();
  readonly #panelAbortControllers = new Map<string, AbortController>();
  readonly #vectorPlans = new Map<string, VectorScenePlan>();
  #profileId: string | null = null;

  constructor(options: ApplicationControllerOptions) {
    this.#store = options.store;
    this.#gateway = options.gateway;
    this.#emit = options.emit;
    this.#rendererMode = options.rendererMode ?? MALIANG_BRAND.defaultRenderer;
    this.#now = options.now ?? (() => new Date());
  }

  async initialize(): Promise<void> {
    this.#store.recoverInterruptedRenderJobs();
    this.#profileId = this.#store.firstLearnerProfileId();
    if (!this.#profileId) {
      this.#profileId = await this.#store.createLearnerProfile();
    }
  }

  listStoryIds(): string[] {
    return this.#store.listStoryIds();
  }

  async createStory(input: CreateStoryInput): Promise<StoryView> {
    const timestamp = this.#now().toISOString();
    const story: Story = {
      id: randomUUID(),
      mode: input.mode,
      title: input.title.trim().slice(0, 100) || "MY COMIC",
      authorDisplayName: input.authorDisplayName?.trim().slice(0, 80) || "you",
      createdAt: timestamp,
      updatedAt: timestamp,
      styleVersion: "comic-pencil-ink/v1",
      status: "DRAFT"
    };
    const panels = STORY_SPINE.map((storySpineSlot, index) => ({
      id: randomUUID(),
      ordinal: index + 1,
      storySpineSlot
    }));
    await this.#store.createStory(story, panels);
    return this.loadStory(story.id);
  }

  async loadStory(storyId: string): Promise<StoryView> {
    const stored = await this.#store.readStory(storyId);
    if (!stored) throw new Error("STORY_NOT_FOUND");
    const panelViews: StoryPanelView[] = [];
    for (const panel of stored.panels) {
      const revision = panel.currentRevisionId
        ? await this.#store.readRevision(panel.currentRevisionId)
        : null;
      const latestJob = revision
        ? this.#store.readLatestRenderJob(revision.id)
        : null;
      let graph: SceneGraph | null = null;
      let contract: RenderContract | null = null;
      let rawArtifact: GeneratedArtifact | null = null;
      if (revision) {
        try {
          graph = await this.#store.readSceneGraph<SceneGraph>(revision.id);
          contract = await this.#store.readRenderContract<RenderContract>(revision.id);
        } catch {
          graph = null;
          contract = null;
        }
        if (contract) {
          const visualHash = hashVisualRenderContract(contract);
          rawArtifact = await this.#readRawCache(
            visualHash,
            contract.modelPolicyVersion
          );
          if (rawArtifact) this.#renderCache.set(visualHash, rawArtifact);
        }
        if (graph && contract) {
          graph = {
            ...graph,
            diagnostics: deriveWritingDiagnostics(
              revision.sourceText,
              graph,
              { clutterActive: contract.clutterPressure.active }
            )
          };
        }
      }
      const version = revision?.version ?? 0;
      this.#revisions.restore(panel.id, version);
      const terminalFailure =
        latestJob &&
        TERMINAL_RENDER_JOB_STATES.has(latestJob.state) &&
        latestJob.state !== "READY" &&
        latestJob.state !== "SUPERSEDED" &&
        latestJob.state !== "BLOCKED";
      const runtime: PanelRuntime = {
        storyId,
        revisionId: revision?.id ?? null,
        version,
        state: revision
          ? latestJob?.state === "BLOCKED"
            ? "blocked"
            : terminalFailure
              ? "failed"
              : panel.currentArtifactId
                ? contract
                  ? stateForContract(contract)
                  : "partial"
                : "pencil"
          : "empty",
        sourceText: revision?.sourceText ?? "",
        artifactId: panel.currentArtifactId,
        graph,
        contract,
        rawArtifact,
        diagnostics: graph?.diagnostics ?? []
      };
      this.#panels.set(panel.id, runtime);
      panelViews.push({
        panelId: panel.id,
        ordinal: panel.ordinal,
        storySpineSlot: panel.storySpineSlot,
        sourceText: runtime.sourceText,
        revisionVersion: version,
        visualState: runtime.state,
        diagnosticCode: runtime.diagnostics[0] ?? null,
        diagnosticCodes: [...runtime.diagnostics],
        artifactUrl: runtime.artifactId
          ? `maliang-artifact://artifact/${runtime.artifactId}`
          : null
      });
    }
    return {
      story: stored.story,
      panels: panelViews,
      selectedPanelId: stored.panels[0]?.id ?? ""
    };
  }

  async updateStoryTitle(storyId: string, title: string): Promise<void> {
    const normalized = title.trim().slice(0, 100) || "MY COMIC";
    await this.#store.updateStoryTitle(storyId, normalized);
  }

  async updatePanelText(input: UpdatePanelTextInput): Promise<PanelRevisionView> {
    const runtime = this.#panels.get(input.panelId);
    if (!runtime) throw new Error("PANEL_NOT_LOADED");
    if (input.baseVersion !== runtime.version) throw new Error("STALE_BASE_VERSION");
    this.#cancelPanelJob(input.panelId);
    const sourceText = input.text.slice(0, 4_000);
    const version = this.#revisions.commit(input.panelId);
    const revision: PanelRevision = {
      id: randomUUID(),
      panelId: input.panelId,
      version,
      sourceText,
      sourceHash: hashSource(sourceText),
      createdAt: this.#now().toISOString(),
      origin: input.origin
    };
    await this.#store.saveRevision(revision);
    const previous = { ...runtime };
    runtime.revisionId = revision.id;
    runtime.version = version;
    runtime.sourceText = sourceText;
    runtime.state = sourceText.trim() ? "drawing" : "empty";
    runtime.diagnostics = [];
    this.#emit({
      type: "panel.state",
      panelId: input.panelId,
      revisionVersion: version,
      state: runtime.state,
      artifactUrl: runtime.artifactId
        ? `maliang-artifact://artifact/${runtime.artifactId}`
        : null,
      diagnosticCode: null,
      diagnosticCodes: []
    });
    if (sourceText.trim()) {
      const controller = new AbortController();
      this.#panelAbortControllers.set(input.panelId, controller);
      void this.#processRevision(revision, previous, {
        signal: controller.signal
      }).finally(() => {
        if (this.#panelAbortControllers.get(input.panelId) === controller) {
          this.#panelAbortControllers.delete(input.panelId);
        }
      });
    }
    return {
      panelId: revision.panelId,
      revisionId: revision.id,
      version,
      sourceText,
      state: runtime.state
    };
  }

  async retryRender(panelId: string): Promise<void> {
    const runtime = this.#panels.get(panelId);
    if (!runtime?.revisionId || !runtime.sourceText.trim()) return;
    const revision = await this.#store.readRevision(runtime.revisionId);
    if (!revision) return;
    this.#cancelPanelJob(panelId);
    const controller = new AbortController();
    this.#panelAbortControllers.set(panelId, controller);
    const previous = { ...runtime, contract: null, rawArtifact: null };
    runtime.state = "drawing";
    this.#emit({
      type: "panel.state",
      panelId,
      revisionVersion: revision.version,
      state: "drawing",
      artifactUrl: runtime.artifactId
        ? `maliang-artifact://artifact/${runtime.artifactId}`
        : null,
      diagnosticCode: null,
      diagnosticCodes: []
    });
    try {
      const resume =
        runtime.graph && runtime.contract
          ? { graph: runtime.graph, contract: runtime.contract }
          : null;
      await this.#processRevision(
        revision,
        previous,
        resume
          ? { signal: controller.signal, resume }
          : { signal: controller.signal }
      );
    } finally {
      if (this.#panelAbortControllers.get(panelId) === controller) {
        this.#panelAbortControllers.delete(panelId);
      }
    }
  }

  async deleteStory(storyId: string): Promise<void> {
    for (const [panelId, runtime] of this.#panels) {
      if (runtime.storyId === storyId) {
        this.#cancelPanelJob(panelId);
        this.#panels.delete(panelId);
      }
    }
    await this.#store.deleteStory(storyId);
  }

  async readDeck(): Promise<CraftDeckView> {
    const profileId = this.#requireProfileId();
    const awards = await this.#store.readAwards(profileId);
    return {
      learnerProfileId: profileId,
      earnedCardIds: awards.map((award) => award.cardId),
      pendingAwards: awards.filter((award) => award.state === "PENDING")
    };
  }

  async acknowledgeAward(awardId: string): Promise<CraftDeckView> {
    this.#store.acknowledgeAward(awardId);
    return this.readDeck();
  }

  async capability(): Promise<ChildSafeCapabilityView> {
    const capability = await this.#gateway.checkCapability();
    return {
      ready: capability.ready,
      reason: capability.reason,
      installedVersion: capability.installedVersion,
      requiredVersion: capability.requiredVersion
    };
  }

  async diagnoseComplaint(
    panelId: string,
    transcript: string
  ): Promise<ComplaintDiagnosisView | null> {
    const runtime = this.#panels.get(panelId);
    if (!runtime?.graph || !runtime.revisionId) return null;
    const revisionVersion = runtime.version;
    const sourceHash = runtime.graph.sourceHash;
    if (detectSensitiveText(transcript).length > 0) {
      return {
        panelId,
        revisionVersion,
        diagnosticCode: "LOW_CONFIDENCE_COMPLAINT"
      };
    }
    const result = await this.#gateway.diagnoseComplaint({
      jobId: `${randomUUID()}-complaint`,
      transcript: transcript.slice(0, 1_000),
      sourceHash,
      graph: runtime.graph
    });
    const current = this.#panels.get(panelId);
    if (
      !current?.graph ||
      current.version !== revisionVersion ||
      current.graph.sourceHash !== sourceHash
    ) {
      return null;
    }
    const diagnosticCode = result.alreadyExpressed
      ? "RENDER_MISMATCH"
      : result.confidence === "low"
        ? "LOW_CONFIDENCE_COMPLAINT"
        : result.code;
    if (revisionCoachingCodes([diagnosticCode]).length > 0) {
      current.diagnostics = [
        diagnosticCode,
        ...current.diagnostics.filter((code) => code !== diagnosticCode)
      ];
    }
    return { panelId, revisionVersion, diagnosticCode };
  }

  async #processRevision(
    revision: PanelRevision,
    previous: PanelRuntime,
    options: ProcessRevisionOptions
  ): Promise<void> {
    const runtime = this.#panels.get(revision.panelId);
    if (!runtime) return;
    const job = this.#createJob(revision);
    this.#store.saveRenderJob(job);

    try {
      if (options.signal.aborted) {
        throw new CodexGatewayError("CANCELLED", "Render was superseded.");
      }

      let graph: SceneGraph;
      let contract: RenderContract;
      let awards: CraftCardAward[] = [];

      if (detectSensitiveText(revision.sourceText).length > 0) {
        this.#terminal(job, "BLOCKED", "PRIVATE_INFORMATION");
        if (this.#isCurrent(revision)) {
          this.#emitTerminal(runtime, revision, "blocked", null);
        }
        return;
      }

      let validatedState = options.resume ?? null;
      if (!validatedState) {
        try {
          validatedState =
            await this.#store.readValidatedStateBySourceHash<
              SceneGraph,
              RenderContract
            >(
              revision.panelId,
              revision.sourceHash,
              revision.id
            );
        } catch {
          validatedState = null;
        }
      }
      const expectedModelPolicy =
        this.#rendererMode === "vector"
          ? MALIANG_BRAND.vectorModelPolicyVersion
          : this.#rendererMode === "openai-api"
            ? MALIANG_BRAND.openAIImageApiModelPolicyVersion
            : MALIANG_BRAND.rasterModelPolicyVersion;
      if (
        validatedState &&
        validatedState.contract.modelPolicyVersion !== expectedModelPolicy
      ) {
        validatedState = null;
      }

      if (validatedState) {
        contract = validatedState.contract;
        graph = {
          ...validatedState.graph,
          diagnostics: deriveWritingDiagnostics(
            revision.sourceText,
            validatedState.graph,
            { clutterActive: contract.clutterPressure.active }
          )
        };
        const contractHash = hashRenderContract(contract);
        job.idempotencyKey = contractHash;
        this.#store.updateRenderJobIdempotency(job.id, contractHash);
        if (!options.resume) {
          await this.#store.saveSceneGraph(
            revision.id,
            graph,
            { reusedValidatedRevision: true },
            "validated-state-cache/1.0.0"
          );
          await this.#store.saveRenderContract(
            revision.id,
            contract,
            COMPILER_VERSION,
            contractHash
          );
          awards = await this.#evaluateAwards(revision, previous, graph);
        }
        this.#move(job, "COMPILED");
        runtime.graph = graph;
        runtime.contract = contract;
        runtime.diagnostics = graph.diagnostics;
      } else {
        this.#move(job, "SAFETY_CHECKING");
        const safety = await this.#extraction.use(() =>
          this.#gateway.classifySafety({
            jobId: `${job.id}-safety`,
            panelText: revision.sourceText,
            sourceHash: revision.sourceHash,
            signal: options.signal
          })
        );
        if (options.signal.aborted || !this.#isCurrent(revision)) {
          this.#terminal(job, "SUPERSEDED");
          return;
        }
        if (safety.action === "BLOCK_RENDER") {
          this.#terminal(job, "BLOCKED", "SAFETY_REFUSAL");
          this.#emitTerminal(runtime, revision, "blocked", null);
          return;
        }

        this.#move(job, "EXTRACTING");
        const extracted = await this.#extraction.use(() =>
          this.#gateway.extractScene({
            jobId: `${job.id}-extract`,
            panelText: revision.sourceText,
            sourceHash: revision.sourceHash,
            knownEntities: [],
            signal: options.signal
          })
        );
        if (options.signal.aborted || !this.#isCurrent(revision)) {
          this.#terminal(job, "SUPERSEDED");
          return;
        }

        this.#move(job, "VALIDATING");
        let extractorVersion = extracted.gatewayVersion;
        let validated = this.#validator.validate(revision.sourceText, extracted.graph);
        let missingEvidence = validated.graph
          ? unmappedSceneEvidence(revision.sourceText, validated.graph)
          : meaningfulSceneEvidence(revision.sourceText);
        if (!validated.valid || !validated.graph || missingEvidence.length > 0) {
          const repair = await this.#extraction.use(() =>
            this.#gateway.extractScene({
              jobId: `${job.id}-repair`,
              panelText: revision.sourceText,
              sourceHash: revision.sourceHash,
              knownEntities: [],
              requiredEvidence: meaningfulSceneEvidence(revision.sourceText),
              signal: options.signal
            })
          );
          extractorVersion = repair.gatewayVersion;
          validated = this.#validator.validate(revision.sourceText, repair.graph);
          missingEvidence = validated.graph
            ? unmappedSceneEvidence(revision.sourceText, validated.graph)
            : meaningfulSceneEvidence(revision.sourceText);
        }
        if (options.signal.aborted || !this.#isCurrent(revision)) {
          this.#terminal(job, "SUPERSEDED");
          return;
        }
        if (!validated.valid || !validated.graph || missingEvidence.length > 0) {
          this.#terminal(job, "FAILED", "INVALID_SCENE");
          this.#emitTerminal(runtime, revision, "failed", null);
          return;
        }
        contract = this.#compiler.compile(validated.graph, {
          styleVersion: "comic-pencil-ink/v1",
          modelPolicyVersion: expectedModelPolicy
        });
        graph = {
          ...validated.graph,
          diagnostics: deriveWritingDiagnostics(
            revision.sourceText,
            validated.graph,
            { clutterActive: contract.clutterPressure.active }
          )
        };
        await this.#store.saveSceneGraph(
          revision.id,
          graph,
          { issues: validated.issues, removedFields: validated.removedFields },
          extractorVersion
        );
        const contractHash = hashRenderContract(contract);
        job.idempotencyKey = contractHash;
        this.#store.updateRenderJobIdempotency(job.id, contractHash);
        await this.#store.saveRenderContract(
          revision.id,
          contract,
          COMPILER_VERSION,
          contractHash
        );
        this.#move(job, "COMPILED");
        runtime.graph = graph;
        runtime.contract = contract;
        runtime.diagnostics = graph.diagnostics;
        awards = await this.#evaluateAwards(revision, previous, graph);
      }

      const plan = chooseRenderPlan(previous.contract, contract);
      if (plan === "NO_VISUAL_CHANGE" && previous.artifactId) {
        runtime.artifactId = previous.artifactId;
        this.#terminal(job, "READY");
        this.#publishReady(runtime, revision, contract, awards);
        return;
      }

      const visualHash = hashVisualRenderContract(contract);
      if (this.#rendererMode === "vector") {
        let vectorPlan = this.#vectorPlans.get(visualHash) ?? null;
        if (!vectorPlan) {
          this.#move(job, "GENERATING");
          const planned = await this.#images.use(() =>
            this.#gateway.planVectorPanel({
              jobId: `${job.id}-vector-plan`,
              contract,
              signal: options.signal
            })
          );
          vectorPlan = planned.plan;
          this.#vectorPlans.set(visualHash, vectorPlan);
        }
        if (options.signal.aborted || !this.#isCurrent(revision)) {
          this.#terminal(job, "SUPERSEDED");
          return;
        }
        this.#move(job, "COMPOSITING");
        const composed = renderVectorPanelSvg({ contract, plan: vectorPlan });
        const composedArtifact = await this.#store.putArtifact(runtime.storyId, {
          kind: "COMPOSED_IMAGE",
          bytes: composed,
          width: 800,
          height: 600,
          modelPolicyVersion: VECTOR_MODEL_POLICY
        });
        if (!this.#isCurrent(revision)) {
          this.#terminal(job, "SUPERSEDED");
          return;
        }
        runtime.rawArtifact = null;
        runtime.artifactId = composedArtifact.id;
        this.#store.setCurrentArtifactIfRevision(
          revision.panelId,
          revision.id,
          composedArtifact.id
        );
        this.#terminal(job, "READY");
        this.#publishReady(runtime, revision, contract, awards);
        return;
      }

      let raw = plan === "DIALOGUE_ONLY" ? previous.rawArtifact : null;
      raw ??= this.#renderCache.get(visualHash) ?? null;
      raw ??= await this.#readRawCache(visualHash, expectedModelPolicy);

      if (!raw) {
        this.#move(job, "GENERATING");
        raw = await this.#images.use(() =>
          plan === "LOCAL_EDIT" && previous.rawArtifact
            ? this.#gateway.editPanel({
                jobId: `${job.id}-image`,
                contract,
                characterReferencePaths: [],
                baseArtifact: previous.rawArtifact,
                changedFactIds: contract.explicitFacts.map((fact) => fact.factId),
                signal: options.signal
              })
            : this.#gateway.generatePanel({
                jobId: `${job.id}-image`,
                contract,
                characterReferencePaths: [],
                signal: options.signal
              })
        );
      }

      if (options.signal.aborted || !this.#isCurrent(revision)) {
        this.#terminal(job, "SUPERSEDED");
        return;
      }

      this.#renderCache.set(visualHash, raw);
      const rawArtifact = await this.#store.putArtifact(runtime.storyId, {
        kind: "RAW_IMAGE",
        bytes: raw.bytes,
        width: 800,
        height: 600,
        modelPolicyVersion: expectedModelPolicy
      });
      try {
        this.#store.saveRenderCache(visualHash, rawArtifact.id);
      } catch (error) {
        console.warn("[maliang-cache] Could not update the raw-image cache.", error);
      }

      this.#move(job, "COMPOSITING");
      const composed = composePanelSvg({
        artBytes: raw.bytes,
        dialogue: contract.dialogueOverlay
      });
      const composedArtifact = await this.#store.putArtifact(runtime.storyId, {
        kind: "COMPOSED_IMAGE",
        bytes: composed,
        width: 800,
        height: 600,
        modelPolicyVersion: expectedModelPolicy
      });
      if (!this.#isCurrent(revision)) {
        this.#terminal(job, "SUPERSEDED");
        return;
      }
      runtime.rawArtifact = raw;
      runtime.artifactId = composedArtifact.id;
      this.#store.setCurrentArtifactIfRevision(
        revision.panelId,
        revision.id,
        composedArtifact.id
      );
      this.#terminal(job, "READY");
      this.#publishReady(runtime, revision, contract, awards);
    } catch (error) {
      const errorCode =
        error instanceof CodexGatewayError
          ? error.code
          : error instanceof Error
            ? error.name
            : "PROCESS_FAILED";
      if (
        errorCode === "CANCELLED" ||
        options.signal.aborted ||
        !this.#isCurrent(revision)
      ) {
        if (!TERMINAL_RENDER_JOB_STATES.has(job.state)) {
          this.#terminal(job, "SUPERSEDED");
        }
        return;
      }
      if (!TERMINAL_RENDER_JOB_STATES.has(job.state)) {
        const terminalState: RenderJobState =
          errorCode === "AUTH_REQUIRED"
            ? "AUTH_REQUIRED"
            : errorCode === "USAGE_LIMIT"
              ? "USAGE_LIMIT"
              : errorCode === "TIMEOUT"
                ? "TIMED_OUT"
                : "FAILED";
        this.#terminal(job, terminalState, errorCode);
      }
      if (this.#isCurrent(revision)) {
        runtime.state = "failed";
        this.#emit({
          type: "panel.state",
          panelId: revision.panelId,
          revisionVersion: revision.version,
          state: "failed",
          artifactUrl: runtime.artifactId
            ? `maliang-artifact://artifact/${runtime.artifactId}`
            : null,
          diagnosticCode: null,
          diagnosticCodes: [],
          errorCode
        });
      }
    }
  }

  async #evaluateAwards(
    revision: PanelRevision,
    previous: PanelRuntime,
    currentGraph: NonNullable<PanelRuntime["graph"]>
  ): Promise<CraftCardAward[]> {
    if (!previous.graph || !previous.revisionId) return [];
    const profileId = this.#requireProfileId();
    const awards = this.#rewardEngine.evaluate({
      learnerProfileId: profileId,
      triggerRevisionId: previous.revisionId,
      resolvingRevisionId: revision.id,
      previousSourceText: previous.sourceText,
      currentSourceText: revision.sourceText,
      previousGraph: previous.graph,
      currentGraph,
      previousDiagnostics: previous.diagnostics,
      alreadyEarned: this.#store.earnedCardIds(profileId),
      safetyBlocked: false,
      now: this.#now()
    });
    await this.#store.insertAwards(awards);
    return awards;
  }

  #publishReady(
    runtime: PanelRuntime,
    revision: PanelRevision,
    contract: RenderContract,
    awards: readonly CraftCardAward[]
  ): void {
    runtime.state = stateForContract(contract);
    this.#emit({
      type: "panel.state",
      panelId: revision.panelId,
      revisionVersion: revision.version,
      state: runtime.state,
      artifactUrl: runtime.artifactId
        ? `maliang-artifact://artifact/${runtime.artifactId}`
        : null,
      diagnosticCode: runtime.diagnostics[0] ?? null,
      diagnosticCodes: [...runtime.diagnostics]
    });
    const award = awards[0];
    if (award) this.#emit({ type: "card.earned", award });
  }

  #emitTerminal(
    runtime: PanelRuntime,
    revision: PanelRevision,
    state: PanelVisualState,
    diagnosticCode: DiagnosticCode | null
  ): void {
    runtime.state = state;
    this.#emit({
      type: "panel.state",
      panelId: revision.panelId,
      revisionVersion: revision.version,
      state,
      artifactUrl: runtime.artifactId
        ? `maliang-artifact://artifact/${runtime.artifactId}`
        : null,
      diagnosticCode,
      diagnosticCodes: diagnosticCode ? [diagnosticCode] : []
    });
  }

  #createJob(revision: PanelRevision): RenderJob {
    return {
      id: randomUUID(),
      panelId: revision.panelId,
      revisionId: revision.id,
      revisionVersion: revision.version,
      idempotencyKey: revision.sourceHash,
      state: "CREATED",
      attempt: this.#store.nextRenderJobAttempt(revision.id),
      createdAt: this.#now().toISOString()
    };
  }

  #move(job: RenderJob, state: RenderJobState): void {
    job.state = transitionRenderJob(job.state, state);
    this.#store.updateRenderJobState(job.id, job.state);
  }

  #terminal(job: RenderJob, state: RenderJobState, errorCode?: string): void {
    this.#move(job, state);
    if (errorCode) this.#store.updateRenderJobState(job.id, state, errorCode);
  }

  #isCurrent(revision: PanelRevision): boolean {
    return this.#revisions.accepts({
      panelId: revision.panelId,
      revisionVersion: revision.version
    });
  }

  #cancelPanelJob(panelId: string): void {
    const controller = this.#panelAbortControllers.get(panelId);
    if (!controller) return;
    controller.abort();
    this.#panelAbortControllers.delete(panelId);
  }

  async #readRawCache(
    visualHash: string,
    modelPolicy: string
  ): Promise<GeneratedArtifact | null> {
    try {
      const cached = await this.#store.readRenderCache(visualHash);
      const mimeType = cached ? sniffImage(cached.bytes) : null;
      if (!cached || !mimeType) return null;
      return {
        bytes: cached.bytes,
        mimeType,
        modelPolicy,
        durationMs: 0
      };
    } catch {
      return null;
    }
  }

  #requireProfileId(): string {
    if (!this.#profileId) throw new Error("CONTROLLER_NOT_INITIALIZED");
    return this.#profileId;
  }
}
