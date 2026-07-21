import type { DiagnosticCode, SceneGraph } from "@maliang/domain";

export const COACHING_CATALOG_VERSION = "1.1.0";

export interface CoachingTemplate {
  code: DiagnosticCode;
  focusLabel: string;
  question: string;
  message: (entityLabel?: string) => string;
}

export const COACHING_CATALOG: Readonly<Record<DiagnosticCode, CoachingTemplate>> = {
  INTERNAL_STATE_NOT_VISIBLE: {
    code: "INTERNAL_STATE_NOT_VISIBLE",
    focusLabel: "Feeling",
    question: "What could someone notice from the outside?",
    message: () => "Pictures can't see feelings. What would that feeling look like on the outside?"
  },
  GENERIC_OR_MISSING_ACTION: {
    code: "GENERIC_OR_MISSING_ACTION",
    focusLabel: "Action",
    question: "What is happening in this moment?",
    message: (entity = "your character") => `What is ${entity} doing that a picture could show?`
  },
  MISSING_APPEARANCE_DETAIL: {
    code: "MISSING_APPEARANCE_DETAIL",
    focusLabel: "Appearance",
    question: "What do you notice about how it looks?",
    message: (entity = "it") => `What word would show what ${entity} looks like?`
  },
  UNQUOTED_DIALOGUE: {
    code: "UNQUOTED_DIALOGUE",
    focusLabel: "Dialogue",
    question: "What does the reader hear in this moment?",
    message: () => "Which exact words were spoken? Put only those words inside quotation marks."
  },
  SETTING_UNDERSPECIFIED: {
    code: "SETTING_UNDERSPECIFIED",
    focusLabel: "Setting",
    question: "Where is this moment happening?",
    message: () => "Where is this happening? Add a place your picture can show."
  },
  CLUTTER_PRESSURE: {
    code: "CLUTTER_PRESSURE",
    focusLabel: "Details",
    question: "Which details matter most to you?",
    message: () => "That is a lot for one picture. Which three details matter most?"
  },
  MISSING_ENTITY: {
    code: "MISSING_ENTITY",
    focusLabel: "Subject",
    question: "Who or what is part of this moment?",
    message: (entity = "something") => `Where do your words name ${entity}?`
  },
  MISSING_ATTRIBUTE: {
    code: "MISSING_ATTRIBUTE",
    focusLabel: "Description",
    question: "What looks different from what you imagined?",
    message: (entity = "it") => `What word would make ${entity} match what you imagined?`
  },
  ACTION_MISMATCH: {
    code: "ACTION_MISMATCH",
    focusLabel: "Action",
    question: "What is happening in your imagination?",
    message: (entity = "your character") => `What action word would show what ${entity} does?`
  },
  EXCESS_DETAIL: {
    code: "EXCESS_DETAIL",
    focusLabel: "Details",
    question: "Which parts do you want the reader to notice?",
    message: () => "Which three details do you most want the reader to notice?"
  },
  RENDER_MISMATCH: {
    code: "RENDER_MISMATCH",
    focusLabel: "Picture",
    question: "What in the picture does not match your words?",
    message: () => "Your words already say that. I'll try drawing the panel again."
  },
  LOW_CONFIDENCE_COMPLAINT: {
    code: "LOW_CONFIDENCE_COMPLAINT",
    focusLabel: "Your idea",
    question: "What looks different from what you imagined?",
    message: () => "What looks different from what you imagined?"
  }
};

/**
 * The six reviewed curriculum diagnostics that can proactively invite a
 * child-authored revision. The order is also the stable UI priority.
 */
export const REVISION_DIAGNOSTIC_CODES = [
  "INTERNAL_STATE_NOT_VISIBLE",
  "GENERIC_OR_MISSING_ACTION",
  "MISSING_APPEARANCE_DETAIL",
  "UNQUOTED_DIALOGUE",
  "SETTING_UNDERSPECIFIED",
  "CLUTTER_PRESSURE"
] as const satisfies readonly DiagnosticCode[];

export type RevisionDiagnosticCode = (typeof REVISION_DIAGNOSTIC_CODES)[number];

export interface WritingDiagnosticOptions {
  /** The deterministic render compiler's reviewed clutter threshold result. */
  clutterActive?: boolean;
}

const VISIBLE_BEHAVIOR_SLOTS = new Set([
  "pose",
  "facial_expression",
  "gaze",
  "movement"
]);

const APPEARANCE_SLOTS = new Set([
  "relative_size",
  "color",
  "material",
  "texture",
  "body_feature",
  "clothing",
  "identity_object",
  "shape"
]);

// Kept local so this child-facing/browser module never imports the Node-based
// render compiler. This is the same reviewed generic-action class used by the
// reward curriculum.
const GENERIC_ACTIONS = new Set([
  "be",
  "did",
  "do",
  "get",
  "go",
  "got",
  "had",
  "have",
  "is",
  "made",
  "make",
  "move",
  "put",
  "said",
  "says",
  "thing",
  "went"
]);

const SPEECH_REPORTING_ACTIONS = new Set([
  "ask",
  "asked",
  "asks",
  "call",
  "called",
  "calls",
  "cry",
  "cried",
  "cries",
  "exclaim",
  "exclaimed",
  "exclaims",
  "murmur",
  "murmured",
  "murmurs",
  "reply",
  "replied",
  "replies",
  "say",
  "said",
  "says",
  "shout",
  "shouted",
  "shouts",
  "speak",
  "speaks",
  "spoke",
  "tell",
  "tells",
  "told",
  "whisper",
  "whispered",
  "whispers",
  "yell",
  "yelled",
  "yells"
]);

const QUOTE_PAIRS: Readonly<Record<string, string>> = {
  "\"": "\"",
  "“": "”",
  "‘": "’"
};

function normalizedAction(verb: string): string {
  return verb.trim().toLocaleLowerCase("en-US");
}

function hasVisibleBehavior(graph: SceneGraph, entityId: string): boolean {
  if (graph.actions.some((action) =>
    action.agentId === entityId &&
    !GENERIC_ACTIONS.has(normalizedAction(action.verb))
  )) return true;
  const entity = graph.entities.find((candidate) => candidate.entityId === entityId);
  return entity?.attributes.some((attribute) => VISIBLE_BEHAVIOR_SLOTS.has(attribute.slot)) ?? false;
}

function dialogueHasRecognizedQuotes(
  sourceText: string,
  dialogue: SceneGraph["dialogue"][number]
): boolean {
  if (dialogue.quoteStart < 0 || dialogue.quoteEnd > sourceText.length) return false;
  if (dialogue.quoteStart >= dialogue.content.start) return false;
  if (dialogue.quoteEnd <= dialogue.content.end) return false;
  const opening = sourceText[dialogue.quoteStart];
  const closing = sourceText[dialogue.quoteEnd - 1];
  return opening !== undefined && QUOTE_PAIRS[opening] === closing;
}

function sourceHasRecognizedQuotePair(sourceText: string): boolean {
  return Object.entries(QUOTE_PAIRS).some(([opening, closing]) => {
    const openingIndex = sourceText.indexOf(opening);
    return openingIndex >= 0 && sourceText.indexOf(closing, openingIndex + 1) > openingIndex;
  });
}

/**
 * Filters arbitrary diagnostics down to the reviewed revision curriculum,
 * removes duplicates, and applies the stable curriculum priority.
 */
export function revisionCoachingCodes(
  codes: readonly DiagnosticCode[]
): DiagnosticCode[] {
  const present = new Set<DiagnosticCode>(codes);
  return REVISION_DIAGNOSTIC_CODES.filter((code) => present.has(code));
}

/**
 * Reconciles model-supplied diagnostic codes with facts in the validated graph.
 * Only diagnostics defended by those facts survive; complaint-only diagnostics
 * are intentionally outside this proactive writing curriculum.
 */
export function deriveWritingDiagnostics(
  sourceText: string,
  graph: SceneGraph,
  options: WritingDiagnosticOptions = {}
): DiagnosticCode[] {
  if (sourceText.trim().length === 0) return [];

  const hasActionSubject = graph.entities.some((entity) => entity.kind !== "place");
  const feelingWithoutBehavior = graph.internalStates.some(
    (state) => !hasVisibleBehavior(graph, state.entityId)
  );
  const actionAbsentOrGeneric = hasActionSubject && (
    graph.actions.length === 0 ||
    graph.actions.every((action) => GENERIC_ACTIONS.has(normalizedAction(action.verb)))
  );
  const appearanceMissing = graph.entities
    .filter((entity) => entity.kind !== "place")
    .some((entity) =>
      !entity.attributes.some((attribute) => APPEARANCE_SLOTS.has(attribute.slot))
    );
  const reportedSpeech =
    graph.dialogue.length > 0 ||
    graph.actions.some((action) =>
      SPEECH_REPORTING_ACTIONS.has(normalizedAction(action.verb))
    );
  const quotedSpeech =
    sourceHasRecognizedQuotePair(sourceText) ||
    graph.dialogue.some((dialogue) =>
      dialogueHasRecognizedQuotes(sourceText, dialogue)
    );
  const unquotedSpeech = reportedSpeech && !quotedSpeech;
  const settingMissing =
    graph.setting.place === null &&
    graph.setting.time === null &&
    graph.setting.weather === null &&
    graph.setting.lighting === null &&
    graph.setting.objects.length === 0 &&
    !graph.entities.some((entity) => entity.kind === "place");

  const defended: Readonly<Record<RevisionDiagnosticCode, boolean>> = {
    INTERNAL_STATE_NOT_VISIBLE: feelingWithoutBehavior,
    GENERIC_OR_MISSING_ACTION: actionAbsentOrGeneric,
    MISSING_APPEARANCE_DETAIL: appearanceMissing,
    UNQUOTED_DIALOGUE: unquotedSpeech,
    SETTING_UNDERSPECIFIED: settingMissing,
    CLUTTER_PRESSURE: options.clutterActive === true
  };

  const candidates = new Set<DiagnosticCode>(
    revisionCoachingCodes(graph.diagnostics)
  );
  for (const code of REVISION_DIAGNOSTIC_CODES) {
    if (defended[code]) candidates.add(code);
    else candidates.delete(code);
  }

  return revisionCoachingCodes([...candidates]);
}

export function coachingMessage(code: DiagnosticCode, entityLabel?: string): string {
  return COACHING_CATALOG[code].message(entityLabel);
}
