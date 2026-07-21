import { createHash } from "node:crypto";
import {
  ATTRIBUTE_SLOTS,
  type EvidenceRange,
  type SceneDialogue,
  type SceneGraph
} from "@maliang/domain";
import { sceneGraphSchema } from "@maliang/scene-schema";

const VISUAL_FEELING_WORDS = new Set([
  "afraid",
  "angry",
  "anxious",
  "ashamed",
  "brave",
  "confused",
  "embarrassed",
  "excited",
  "glad",
  "happy",
  "jealous",
  "lonely",
  "mad",
  "nervous",
  "proud",
  "sad",
  "scared",
  "terrified",
  "worried"
]);

const VISUAL_STATE_SLOTS = new Set(["pose", "facial_expression", "gaze", "movement"]);
const QUOTE_PAIRS: Readonly<Record<string, string>> = {
  "\"": "\"",
  "“": "”",
  "‘": "’"
};

export interface ValidationIssue {
  path: string;
  code:
    | "SCHEMA_INVALID"
    | "SOURCE_HASH_MISMATCH"
    | "EVIDENCE_RANGE_INVALID"
    | "EVIDENCE_TEXT_MISMATCH"
    | "UNICODE_BOUNDARY_INVALID"
    | "ENTITY_REFERENCE_INVALID"
    | "DIALOGUE_NOT_QUOTED"
    | "FEELING_INFERRED_VISUALLY"
    | "ONTOLOGY_SLOT_INVALID";
  message: string;
}

export interface SceneValidationResult {
  valid: boolean;
  graph: SceneGraph | null;
  issues: ValidationIssue[];
  removedFields: string[];
}

const COVERAGE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "been",
  "being",
  "but",
  "did",
  "do",
  "does",
  "had",
  "has",
  "have",
  "he",
  "her",
  "hers",
  "him",
  "his",
  "i",
  "is",
  "it",
  "its",
  "me",
  "my",
  "or",
  "our",
  "ours",
  "she",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "they",
  "this",
  "those",
  "us",
  "was",
  "we",
  "were",
  "with",
  "will",
  "you",
  "your",
  "yours"
]);

export function hashSource(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

function isCodePointBoundary(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return true;
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}

function evidenceIssue(
  text: string,
  evidence: EvidenceRange,
  path: string
): ValidationIssue | null {
  if (
    evidence.start < 0 ||
    evidence.end < evidence.start ||
    evidence.end > text.length
  ) {
    return {
      path,
      code: "EVIDENCE_RANGE_INVALID",
      message: "Evidence range falls outside the current panel text."
    };
  }
  if (!isCodePointBoundary(text, evidence.start) || !isCodePointBoundary(text, evidence.end)) {
    return {
      path,
      code: "UNICODE_BOUNDARY_INVALID",
      message: "Evidence range splits a Unicode code point."
    };
  }
  if (text.slice(evidence.start, evidence.end) !== evidence.text) {
    return {
      path,
      code: "EVIDENCE_TEXT_MISMATCH",
      message: "Evidence text does not exactly equal the current source span."
    };
  }
  return null;
}

function isQuoted(text: string, dialogue: SceneDialogue): boolean {
  if (dialogue.quoteStart < 0 || dialogue.quoteEnd > text.length) return false;
  if (dialogue.quoteStart >= dialogue.content.start) return false;
  if (dialogue.quoteEnd <= dialogue.content.end) return false;
  const opening = text[dialogue.quoteStart];
  const closing = text[dialogue.quoteEnd - 1];
  return opening !== undefined && QUOTE_PAIRS[opening] === closing;
}

function normalizedEvidenceWords(text: string): string[] {
  return text.toLocaleLowerCase("en-US").match(/\p{L}+(?:['’]\p{L}+)*/gu) ?? [];
}

function isFeelingOnlyEvidence(evidence: EvidenceRange): boolean {
  const words = normalizedEvidenceWords(evidence.text);
  return words.length > 0 && words.every((word) => VISUAL_FEELING_WORDS.has(word));
}

function graphEvidence(graph: SceneGraph): EvidenceRange[] {
  return [
    ...graph.entities.flatMap((entity) => [
      entity.label.evidence,
      ...entity.attributes.map((attribute) => attribute.evidence)
    ]),
    ...graph.actions.map((action) => action.evidence),
    ...[
      graph.setting.place,
      graph.setting.time,
      graph.setting.weather,
      graph.setting.lighting
    ].flatMap((value) => value ? [value.evidence] : []),
    ...graph.setting.objects.map((object) => object.evidence),
    ...graph.internalStates.map((state) => state.evidence),
    ...graph.dialogue.map((dialogue) => dialogue.content),
    ...graph.sequenceMarkers.map((marker) => marker.evidence)
  ];
}

/**
 * Returns meaningful source words that must be bound to typed scene facts.
 * Function words that carry visual relationships (for example "in", "under",
 * and "behind") intentionally remain subject to this check so an extractor
 * cannot silently drop composition or setting details. "With" is ignored
 * because ownership is already represented by the typed fact's entity binding.
 */
export function meaningfulSceneEvidence(sourceText: string): EvidenceRange[] {
  return [...sourceText.matchAll(/\p{L}+(?:['’]\p{L}+)*/gu)].flatMap((match) => {
    const text = match[0];
    const start = match.index;
    const end = start + text.length;
    if (COVERAGE_STOP_WORDS.has(text.toLocaleLowerCase("en-US"))) return [];
    return [{ start, end, text }];
  });
}

/**
 * Finds meaningful source words that the extractor failed to bind to any typed
 * scene fact.
 */
export function unmappedSceneEvidence(
  sourceText: string,
  graph: SceneGraph
): EvidenceRange[] {
  const evidence = graphEvidence(graph);
  return meaningfulSceneEvidence(sourceText).filter(({ start, end }) =>
    !evidence.some((range) => range.start <= start && range.end >= end)
  );
}

export class SceneValidator {
  validate(sourceText: string, candidate: unknown): SceneValidationResult {
    const parsed = sceneGraphSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        valid: false,
        graph: null,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          code: "SCHEMA_INVALID",
          message: issue.message
        })),
        removedFields: []
      };
    }

    const graph = structuredClone(parsed.data) as SceneGraph;
    const issues: ValidationIssue[] = [];
    const removedFields: string[] = [];
    if (graph.sourceHash !== hashSource(sourceText)) {
      issues.push({
        path: "sourceHash",
        code: "SOURCE_HASH_MISMATCH",
        message: "Scene graph belongs to a different source revision."
      });
      return { valid: false, graph: null, issues, removedFields };
    }

    const entityIds = new Set(graph.entities.map((entity) => entity.entityId));

    graph.entities = graph.entities.flatMap((entity, entityIndex) => {
      const labelPath = `entities.${entityIndex}.label.evidence`;
      const labelIssue = evidenceIssue(sourceText, entity.label.evidence, labelPath);
      if (labelIssue) {
        issues.push(labelIssue);
        removedFields.push(`entities.${entityIndex}`);
        return [];
      }
      entity.attributes = entity.attributes.filter((attribute, attributeIndex) => {
        const path = `entities.${entityIndex}.attributes.${attributeIndex}`;
        if (!ATTRIBUTE_SLOTS.includes(attribute.slot)) {
          issues.push({
            path,
            code: "ONTOLOGY_SLOT_INVALID",
            message: "Attribute slot is outside the visual ontology."
          });
          removedFields.push(path);
          return false;
        }
        const issue = evidenceIssue(sourceText, attribute.evidence, `${path}.evidence`);
        if (issue) {
          issues.push(issue);
          removedFields.push(path);
          return false;
        }
        if (
          VISUAL_STATE_SLOTS.has(attribute.slot) &&
          isFeelingOnlyEvidence(attribute.evidence)
        ) {
          issues.push({
            path,
            code: "FEELING_INFERRED_VISUALLY",
            message: "Internal-state evidence cannot populate a visible state slot."
          });
          removedFields.push(path);
          return false;
        }
        return true;
      });
      return [entity];
    });

    graph.actions = graph.actions.filter((action, index) => {
      const path = `actions.${index}`;
      const issue = evidenceIssue(sourceText, action.evidence, `${path}.evidence`);
      const refs = [action.agentId, action.targetId, action.instrumentId].filter(
        (value): value is string => Boolean(value)
      );
      const invalidRef = refs.find((ref) => !entityIds.has(ref));
      if (issue) {
        issues.push(issue);
        removedFields.push(path);
        return false;
      }
      if (invalidRef) {
        issues.push({
          path,
          code: "ENTITY_REFERENCE_INVALID",
          message: `Action references unknown entity ${invalidRef}.`
        });
        removedFields.push(path);
        return false;
      }
      return true;
    });

    graph.internalStates = graph.internalStates.filter((state, index) => {
      const path = `internalStates.${index}`;
      const issue = evidenceIssue(sourceText, state.evidence, `${path}.evidence`);
      if (issue) {
        issues.push(issue);
        removedFields.push(path);
        return false;
      }
      if (!entityIds.has(state.entityId)) {
        issues.push({
          path,
          code: "ENTITY_REFERENCE_INVALID",
          message: `Internal state references unknown entity ${state.entityId}.`
        });
        removedFields.push(path);
        return false;
      }
      return true;
    });

    const settingValues = [
      ["place", graph.setting.place],
      ["time", graph.setting.time],
      ["weather", graph.setting.weather],
      ["lighting", graph.setting.lighting]
    ] as const;
    for (const [slot, value] of settingValues) {
      if (!value) continue;
      const issue = evidenceIssue(sourceText, value.evidence, `setting.${slot}.evidence`);
      if (issue) {
        issues.push(issue);
        graph.setting[slot] = null;
        removedFields.push(`setting.${slot}`);
      }
    }
    graph.setting.objects = graph.setting.objects.filter((object, index) => {
      const path = `setting.objects.${index}`;
      const issue = evidenceIssue(sourceText, object.evidence, `${path}.evidence`);
      if (issue) {
        issues.push(issue);
        removedFields.push(path);
        return false;
      }
      return true;
    });

    graph.dialogue = graph.dialogue.filter((dialogue, index) => {
      const path = `dialogue.${index}`;
      const issue = evidenceIssue(sourceText, dialogue.content, `${path}.content`);
      if (issue) {
        issues.push(issue);
        removedFields.push(path);
        return false;
      }
      if (dialogue.speakerId && !entityIds.has(dialogue.speakerId)) {
        issues.push({
          path,
          code: "ENTITY_REFERENCE_INVALID",
          message: `Dialogue references unknown entity ${dialogue.speakerId}.`
        });
        removedFields.push(path);
        return false;
      }
      if (!isQuoted(sourceText, dialogue)) {
        issues.push({
          path,
          code: "DIALOGUE_NOT_QUOTED",
          message: "Dialogue content is not enclosed by recognized quotation marks."
        });
        removedFields.push(path);
        return false;
      }
      return true;
    });

    graph.sequenceMarkers = graph.sequenceMarkers.filter((marker, index) => {
      const path = `sequenceMarkers.${index}`;
      const issue = evidenceIssue(sourceText, marker.evidence, `${path}.evidence`);
      if (issue) {
        issues.push(issue);
        removedFields.push(path);
        return false;
      }
      return true;
    });

    return {
      valid: true,
      graph,
      issues,
      removedFields
    };
  }
}
