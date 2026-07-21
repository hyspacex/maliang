import { describe, expect, it } from "vitest";
import type {
  DiagnosticCode,
  EvidenceRange,
  SceneAttribute,
  SceneGraph
} from "@maliang/domain";
import {
  deriveWritingDiagnostics,
  REVISION_DIAGNOSTIC_CODES,
  revisionCoachingCodes
} from "@maliang/coaching-catalog";

function evidence(sourceText: string, text: string): EvidenceRange {
  const start = sourceText.indexOf(text);
  if (start < 0) throw new Error(`Missing test evidence: ${text}`);
  return { start, end: start + text.length, text };
}

interface GraphOptions {
  attributes?: readonly Pick<SceneAttribute, "slot" | "value" | "scope">[];
  actions?: readonly string[];
  feeling?: string;
  place?: string;
  dialogue?: string;
  diagnostics?: readonly DiagnosticCode[];
}

function graph(sourceText: string, options: GraphOptions = {}): SceneGraph {
  const entityId = "character:mara";
  const dialogueStart = options.dialogue
    ? sourceText.indexOf(options.dialogue)
    : -1;
  const quoteStart = options.dialogue
    ? Math.max(sourceText.lastIndexOf("\"", dialogueStart), sourceText.lastIndexOf("“", dialogueStart))
    : -1;
  const closingStraightQuote = options.dialogue
    ? sourceText.indexOf("\"", dialogueStart + options.dialogue.length)
    : -1;
  const closingCurlyQuote = options.dialogue
    ? sourceText.indexOf("”", dialogueStart + options.dialogue.length)
    : -1;
  const closingQuote = Math.max(closingStraightQuote, closingCurlyQuote);

  return {
    schemaVersion: 1,
    sourceHash: "sha256:test",
    entities: [{
      entityId,
      kind: "character",
      label: { value: "Mara", evidence: evidence(sourceText, "Mara") },
      attributes: (options.attributes ?? []).map((attribute) => ({
        ...attribute,
        evidence: evidence(sourceText, attribute.value)
      }))
    }],
    actions: (options.actions ?? []).map((verb) => ({
      agentId: entityId,
      verb,
      evidence: evidence(sourceText, verb)
    })),
    setting: {
      place: options.place
        ? { value: options.place, evidence: evidence(sourceText, options.place) }
        : null,
      time: null,
      weather: null,
      lighting: null,
      objects: []
    },
    internalStates: options.feeling ? [{
      entityId,
      state: options.feeling,
      evidence: evidence(sourceText, options.feeling)
    }] : [],
    dialogue: options.dialogue ? [{
      speakerId: entityId,
      content: evidence(sourceText, options.dialogue),
      quoteStart,
      quoteEnd: closingQuote + 1
    }] : [],
    sequenceMarkers: [],
    diagnostics: [...(options.diagnostics ?? [])]
  };
}

const appearance: readonly Pick<SceneAttribute, "slot" | "value" | "scope">[] = [{
  slot: "color",
  value: "Blue",
  scope: "identity_from_here"
}];

describe("revision coaching diagnostics", () => {
  it("filters complaint codes, deduplicates, and restores curriculum priority", () => {
    expect(revisionCoachingCodes([
      "CLUTTER_PRESSURE",
      "MISSING_ENTITY",
      "MISSING_APPEARANCE_DETAIL",
      "CLUTTER_PRESSURE",
      "INTERNAL_STATE_NOT_VISIBLE",
      "RENDER_MISMATCH"
    ])).toEqual([
      "INTERNAL_STATE_NOT_VISIBLE",
      "MISSING_APPEARANCE_DETAIL",
      "CLUTTER_PRESSURE"
    ]);
    expect(REVISION_DIAGNOSTIC_CODES).toHaveLength(6);
  });

  it("derives each defensible need and removes unsupported model suggestions", () => {
    const sourceText = "Mara felt worried.";
    const scene = graph(sourceText, {
      feeling: "worried",
      diagnostics: [
        "CLUTTER_PRESSURE",
        "LOW_CONFIDENCE_COMPLAINT",
        "UNQUOTED_DIALOGUE",
        "MISSING_ENTITY"
      ]
    });

    expect(deriveWritingDiagnostics(sourceText, scene, { clutterActive: false })).toEqual([
      "INTERNAL_STATE_NOT_VISIBLE",
      "GENERIC_OR_MISSING_ACTION",
      "MISSING_APPEARANCE_DETAIL",
      "SETTING_UNDERSPECIFIED"
    ]);
  });

  it("does not mistake a generic verb for visible evidence of a feeling", () => {
    const sourceText = "Mara is worried.";
    const scene = graph(sourceText, {
      actions: ["is"],
      feeling: "worried"
    });

    expect(deriveWritingDiagnostics(sourceText, scene)).toContain(
      "INTERNAL_STATE_NOT_VISIBLE"
    );
  });

  it("strips every contradicted proactive code from a resolved scene", () => {
    const sourceText = "Blue Mara sprinted through the cave and shouted, “We made it!”";
    const scene = graph(sourceText, {
      attributes: appearance,
      actions: ["sprinted", "shouted"],
      feeling: "made",
      place: "cave",
      dialogue: "We made it!",
      diagnostics: [...REVISION_DIAGNOSTIC_CODES]
    });

    expect(deriveWritingDiagnostics(sourceText, scene, { clutterActive: false })).toEqual([]);
  });

  it("identifies reported speech only when no recognized quoted dialogue defends it", () => {
    const unquotedText = "Blue Mara whispered that the gate was open in the cave.";
    const unquoted = graph(unquotedText, {
      attributes: appearance,
      actions: ["whispered"],
      place: "cave"
    });
    expect(deriveWritingDiagnostics(unquotedText, unquoted)).toEqual([
      "UNQUOTED_DIALOGUE"
    ]);

    const quotedText = "Blue Mara whispered, “The gate is open,” in the cave.";
    const quoted = graph(quotedText, {
      attributes: appearance,
      actions: ["whispered"],
      place: "cave",
      dialogue: "The gate is open,"
    });
    expect(deriveWritingDiagnostics(quotedText, quoted)).toEqual([]);

    const omittedDialogue = graph(quotedText, {
      attributes: appearance,
      actions: ["whispered"],
      place: "cave",
      diagnostics: ["UNQUOTED_DIALOGUE"]
    });
    expect(deriveWritingDiagnostics(quotedText, omittedDialogue)).toEqual([]);
  });

  it("uses only the deterministic compiler result for clutter", () => {
    const sourceText = "Blue Mara sprinted through the cave.";
    const scene = graph(sourceText, {
      attributes: appearance,
      actions: ["sprinted"],
      place: "cave",
      diagnostics: ["CLUTTER_PRESSURE", "EXCESS_DETAIL"]
    });

    expect(deriveWritingDiagnostics(sourceText, scene, { clutterActive: false })).toEqual([]);
    expect(deriveWritingDiagnostics(sourceText, scene, { clutterActive: true })).toEqual([
      "CLUTTER_PRESSURE"
    ]);
  });

  it("does not coach an empty draft", () => {
    const scene = graph("Mara", {
      diagnostics: [...REVISION_DIAGNOSTIC_CODES]
    });
    expect(deriveWritingDiagnostics("   ", scene, { clutterActive: true })).toEqual([]);
  });
});
