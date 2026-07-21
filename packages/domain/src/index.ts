export const MALIANG_BRAND = {
  productName: "MALIANG",
  mascotDisplayName: "Mali",
  panelCount: 6,
  modelPolicyVersion:
    "codex-gpt-5.6-terra+openai-images-gpt-image-2-low-960x720-jpeg72/v1",
  defaultRenderer: "openai-api",
  rasterModelPolicyVersion: "codex-gpt-5.6-terra+sol-imagegen-gpt-image-2/v3",
  vectorModelPolicyVersion: "codex-gpt-5.6-terra-vector-plan+local-svg/v1",
  openAIImageApiModelPolicyVersion:
    "codex-gpt-5.6-terra+openai-images-gpt-image-2-low-960x720-jpeg72/v1"
} as const;

export type StoryMode = "GYM" | "AUTHOR";
export type StoryStatus = "DRAFT" | "COMPLETE";
export type RevisionOrigin = "KEYBOARD" | "VOICE";

export interface EvidenceRange {
  start: number;
  end: number;
  text: string;
}

export interface EvidenceValue<T extends string = string> {
  value: T;
  evidence: EvidenceRange;
}

export const ATTRIBUTE_SLOTS = [
  "relative_size",
  "color",
  "material",
  "texture",
  "body_feature",
  "clothing",
  "identity_object",
  "pose",
  "facial_expression",
  "gaze",
  "movement",
  "held_object",
  "relative_position",
  "shape"
] as const;

export type AttributeSlot = (typeof ATTRIBUTE_SLOTS)[number];
export type AttributeScope = "identity_from_here" | "panel_state";

export interface SceneAttribute {
  slot: AttributeSlot;
  value: string;
  scope: AttributeScope;
  evidence: EvidenceRange;
}

export type EntityKind =
  | "character"
  | "animal"
  | "object"
  | "place"
  | "group";

export interface SceneEntity {
  entityId: string;
  kind: EntityKind;
  label: EvidenceValue;
  attributes: SceneAttribute[];
}

export interface SceneAction {
  agentId: string;
  verb: string;
  targetId?: string;
  instrumentId?: string;
  manner?: string;
  direction?: string;
  result?: string;
  evidence: EvidenceRange;
}

export interface InternalState {
  entityId: string;
  state: string;
  evidence: EvidenceRange;
}

export interface SceneSetting {
  place: EvidenceValue | null;
  time: EvidenceValue | null;
  weather: EvidenceValue | null;
  lighting: EvidenceValue | null;
  objects: EvidenceValue[];
}

export interface SceneDialogue {
  speakerId: string | null;
  content: EvidenceRange;
  quoteStart: number;
  quoteEnd: number;
}

export interface SceneGraph {
  schemaVersion: 1;
  sourceHash: string;
  entities: SceneEntity[];
  actions: SceneAction[];
  setting: SceneSetting;
  internalStates: InternalState[];
  dialogue: SceneDialogue[];
  sequenceMarkers: EvidenceValue[];
  diagnostics: DiagnosticCode[];
}

export const DIAGNOSTIC_CODES = [
  "INTERNAL_STATE_NOT_VISIBLE",
  "GENERIC_OR_MISSING_ACTION",
  "MISSING_APPEARANCE_DETAIL",
  "UNQUOTED_DIALOGUE",
  "SETTING_UNDERSPECIFIED",
  "CLUTTER_PRESSURE",
  "MISSING_ENTITY",
  "MISSING_ATTRIBUTE",
  "ACTION_MISMATCH",
  "EXCESS_DETAIL",
  "RENDER_MISMATCH",
  "LOW_CONFIDENCE_COMPLAINT"
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export interface Story {
  id: string;
  mode: StoryMode;
  title: string;
  authorDisplayName: string;
  createdAt: string;
  updatedAt: string;
  styleVersion: string;
  status: StoryStatus;
}

export interface Panel {
  id: string;
  storyId: string;
  ordinal: number;
  currentRevisionId: string | null;
  currentArtifactId: string | null;
  storySpineSlot: string;
}

export interface PanelRevision {
  id: string;
  panelId: string;
  version: number;
  sourceText: string;
  sourceHash: string;
  createdAt: string;
  origin: RevisionOrigin;
}

export const RENDER_JOB_STATES = [
  "CREATED",
  "SAFETY_CHECKING",
  "EXTRACTING",
  "VALIDATING",
  "COMPILED",
  "GENERATING",
  "COMPOSITING",
  "READY",
  "SUPERSEDED",
  "AUTH_REQUIRED",
  "USAGE_LIMIT",
  "TIMED_OUT",
  "FAILED",
  "BLOCKED"
] as const;

export type RenderJobState = (typeof RENDER_JOB_STATES)[number];

export const TERMINAL_RENDER_JOB_STATES = new Set<RenderJobState>([
  "READY",
  "SUPERSEDED",
  "AUTH_REQUIRED",
  "USAGE_LIMIT",
  "TIMED_OUT",
  "FAILED",
  "BLOCKED"
]);

const JOB_TRANSITIONS: Readonly<Record<RenderJobState, readonly RenderJobState[]>> = {
  CREATED: ["SAFETY_CHECKING", "COMPILED", "SUPERSEDED"],
  SAFETY_CHECKING: ["EXTRACTING", "BLOCKED", "SUPERSEDED", "AUTH_REQUIRED", "USAGE_LIMIT", "TIMED_OUT", "FAILED"],
  EXTRACTING: ["VALIDATING", "SUPERSEDED", "AUTH_REQUIRED", "USAGE_LIMIT", "TIMED_OUT", "FAILED"],
  VALIDATING: ["COMPILED", "SUPERSEDED", "FAILED"],
  COMPILED: ["GENERATING", "COMPOSITING", "READY", "SUPERSEDED", "FAILED"],
  GENERATING: ["COMPOSITING", "SUPERSEDED", "AUTH_REQUIRED", "USAGE_LIMIT", "TIMED_OUT", "FAILED"],
  COMPOSITING: ["READY", "SUPERSEDED", "FAILED"],
  READY: [],
  SUPERSEDED: [],
  AUTH_REQUIRED: [],
  USAGE_LIMIT: [],
  TIMED_OUT: [],
  FAILED: [],
  BLOCKED: []
};

export function transitionRenderJob(
  current: RenderJobState,
  next: RenderJobState
): RenderJobState {
  if (!JOB_TRANSITIONS[current].includes(next)) {
    throw new Error(`Invalid render-job transition: ${current} -> ${next}`);
  }
  return next;
}

export interface RenderJob {
  id: string;
  panelId: string;
  revisionId: string;
  revisionVersion: number;
  idempotencyKey: string;
  state: RenderJobState;
  attempt: number;
  createdAt: string;
}

export interface RevisionResult<T> {
  panelId: string;
  revisionVersion: number;
  value: T;
}

/**
 * Owns only revision ordering. Superseded work may finish and be cached, but
 * `accept` returns false unless it still belongs to the current revision.
 */
export class RevisionGuard {
  readonly #versions = new Map<string, number>();

  commit(panelId: string): number {
    const next = (this.#versions.get(panelId) ?? 0) + 1;
    this.#versions.set(panelId, next);
    return next;
  }

  current(panelId: string): number {
    return this.#versions.get(panelId) ?? 0;
  }

  restore(panelId: string, version: number): void {
    const current = this.current(panelId);
    if (version < current) {
      throw new Error("Cannot restore a panel to an older revision");
    }
    this.#versions.set(panelId, version);
  }

  accepts(result: Pick<RevisionResult<unknown>, "panelId" | "revisionVersion">): boolean {
    return this.current(result.panelId) === result.revisionVersion;
  }
}

export type PanelVisualState =
  | "empty"
  | "drawing"
  | "pencil"
  | "partial"
  | "inked"
  | "blocked"
  | "failed";

export interface PanelRevisionView {
  panelId: string;
  revisionId: string;
  version: number;
  sourceText: string;
  state: PanelVisualState;
}

export interface StoryPanelView {
  panelId: string;
  ordinal: number;
  storySpineSlot: string;
  sourceText: string;
  revisionVersion: number;
  visualState: PanelVisualState;
  diagnosticCode: DiagnosticCode | null;
  diagnosticCodes: DiagnosticCode[];
  artifactUrl: string | null;
}

export interface ComplaintDiagnosisView {
  panelId: string;
  revisionVersion: number;
  diagnosticCode: DiagnosticCode;
}

export interface StoryView {
  story: Story;
  panels: StoryPanelView[];
  selectedPanelId: string;
}

export interface ChildSafeCapabilityView {
  ready: boolean;
  reason: "READY" | "AUTH_REQUIRED" | "VERSION_MISMATCH" | "MODEL_UNAVAILABLE";
  installedVersion: string | null;
  requiredVersion: string;
}

export type CraftCardId = "show" | "verbs" | "size" | "quotes" | "place" | "pick3";
export type AwardState = "PENDING" | "ACKNOWLEDGED";

export interface CraftCardAward {
  id: string;
  learnerProfileId: string;
  cardId: CraftCardId;
  triggerRevisionId: string;
  resolvingRevisionId: string;
  changedEvidence: EvidenceRange[];
  state: AwardState;
  earnedAt: string;
  acknowledgedAt: string | null;
}

export interface CraftDeckView {
  learnerProfileId: string;
  earnedCardIds: CraftCardId[];
  pendingAwards: CraftCardAward[];
}

export interface CreateStoryInput {
  mode: StoryMode;
  title: string;
  authorDisplayName?: string;
}

export interface UpdatePanelTextInput {
  panelId: string;
  baseVersion: number;
  text: string;
  origin: RevisionOrigin;
}

export interface ParentGate {
  confirmed: true;
}

export interface ExportToken {
  token: string;
}

export interface MaliangBridge {
  createStory(input: CreateStoryInput): Promise<StoryView>;
  loadStory(storyId: string): Promise<StoryView>;
  deleteStory(storyId: string, parentGate: ParentGate): Promise<void>;
  exportPdf(storyId: string, token: ExportToken): Promise<void>;
  updatePanelText(input: UpdatePanelTextInput): Promise<PanelRevisionView>;
  retryRender(panelId: string): Promise<void>;
  readDeck(profileId: string): Promise<CraftDeckView>;
  acknowledgeAward(awardId: string): Promise<CraftDeckView>;
  capability(): Promise<ChildSafeCapabilityView>;
}
