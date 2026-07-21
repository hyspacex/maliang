import { createHash } from "node:crypto";
import type {
  AttributeSlot,
  EvidenceRange,
  SceneAttribute,
  SceneGraph
} from "@maliang/domain";

export const RENDER_CONTRACT_VERSION = 1;
export const COMPILER_VERSION = "literal-compiler/1.0.0";

export interface ExplicitVisualFact {
  factId: string;
  entityId: string | null;
  category: "presence" | "identity" | "state" | "action" | "setting" | "composition";
  slot: string;
  value: string;
  evidence: EvidenceRange;
}

export interface PencilSlot {
  entityId: string | null;
  slot: string;
  treatment: "gray_pencil" | "blank_paper";
  reason: "present_but_unspecified" | "setting_unspecified";
}

export interface DialogueOverlay {
  speakerId: string | null;
  exactText: string;
  source: EvidenceRange;
}

export interface ClutterPressure {
  score: number;
  threshold: number;
  active: boolean;
  contributors: {
    attributes: number;
    objects: number;
    spatialConstraints: number;
    repeatedModifiers: number;
    actions: number;
    dialogueArea: number;
  };
}

export interface RenderContract {
  contractVersion: 1;
  compilerVersion: string;
  sourceHash: string;
  styleVersion: string;
  modelPolicyVersion: string;
  explicitFacts: ExplicitVisualFact[];
  pencilSlots: PencilSlot[];
  absentObjects: string[];
  prohibitedAdditions: string[];
  characterReferenceVersions: Record<string, string>;
  clutterPressure: ClutterPressure;
  dialogueOverlay: DialogueOverlay[];
}

export interface CompileOptions {
  styleVersion: string;
  modelPolicyVersion: string;
  inheritedIdentity?: ReadonlyMap<string, readonly SceneAttribute[]>;
  characterReferenceVersions?: Readonly<Record<string, string>>;
}

export function renderContractJsonSchema(): Record<string, unknown> {
  const evidence = {
    type: "object",
    additionalProperties: false,
    required: ["start", "end", "text"],
    properties: {
      start: { type: "integer", minimum: 0 },
      end: { type: "integer", minimum: 0 },
      text: { type: "string" }
    }
  };
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://maliang.local/schemas/render-contract.v1.json",
    title: "Maliang Render Contract v1",
    type: "object",
    additionalProperties: false,
    required: [
      "contractVersion",
      "compilerVersion",
      "sourceHash",
      "styleVersion",
      "modelPolicyVersion",
      "explicitFacts",
      "pencilSlots",
      "absentObjects",
      "prohibitedAdditions",
      "characterReferenceVersions",
      "clutterPressure",
      "dialogueOverlay"
    ],
    properties: {
      contractVersion: { const: 1 },
      compilerVersion: { type: "string" },
      sourceHash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      styleVersion: { type: "string" },
      modelPolicyVersion: { type: "string" },
      explicitFacts: {
        type: "array",
        maxItems: 128,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["factId", "entityId", "category", "slot", "value", "evidence"],
          properties: {
            factId: { type: "string" },
            entityId: { type: ["string", "null"] },
            category: {
              enum: ["presence", "identity", "state", "action", "setting", "composition"]
            },
            slot: { type: "string" },
            value: { type: "string" },
            evidence
          }
        }
      },
      pencilSlots: {
        type: "array",
        maxItems: 128,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["entityId", "slot", "treatment", "reason"],
          properties: {
            entityId: { type: ["string", "null"] },
            slot: { type: "string" },
            treatment: { enum: ["gray_pencil", "blank_paper"] },
            reason: { enum: ["present_but_unspecified", "setting_unspecified"] }
          }
        }
      },
      absentObjects: { type: "array", items: { type: "string" } },
      prohibitedAdditions: { type: "array", items: { type: "string" } },
      characterReferenceVersions: {
        type: "object",
        additionalProperties: { type: "string" }
      },
      clutterPressure: {
        type: "object",
        additionalProperties: false,
        required: ["score", "threshold", "active", "contributors"],
        properties: {
          score: { type: "number", minimum: 0 },
          threshold: { type: "number", minimum: 0 },
          active: { type: "boolean" },
          contributors: {
            type: "object",
            additionalProperties: false,
            required: [
              "attributes",
              "objects",
              "spatialConstraints",
              "repeatedModifiers",
              "actions",
              "dialogueArea"
            ],
            properties: Object.fromEntries(
              [
                "attributes",
                "objects",
                "spatialConstraints",
                "repeatedModifiers",
                "actions",
                "dialogueArea"
              ].map((key) => [key, { type: "integer", minimum: 0 }])
            )
          }
        }
      },
      dialogueOverlay: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["speakerId", "exactText", "source"],
          properties: {
            speakerId: { type: ["string", "null"] },
            exactText: { type: "string" },
            source: evidence
          }
        }
      }
    }
  };
}

const REQUIRED_IDENTITY_SLOTS: readonly AttributeSlot[] = [
  "relative_size",
  "color",
  "texture"
];

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

function fact(
  factId: string,
  entityId: string | null,
  category: ExplicitVisualFact["category"],
  slot: string,
  value: string,
  evidence: EvidenceRange
): ExplicitVisualFact {
  return { factId, entityId, category, slot, value, evidence };
}

function identityAttributes(
  graph: SceneGraph,
  inherited: ReadonlyMap<string, readonly SceneAttribute[]>
): Map<string, SceneAttribute[]> {
  const result = new Map<string, SceneAttribute[]>();
  for (const entity of graph.entities) {
    const slots = new Map<AttributeSlot, SceneAttribute>();
    for (const attribute of inherited.get(entity.entityId) ?? []) {
      if (attribute.scope === "identity_from_here") slots.set(attribute.slot, attribute);
    }
    for (const attribute of entity.attributes) {
      if (attribute.scope === "identity_from_here") slots.set(attribute.slot, attribute);
    }
    result.set(entity.entityId, [...slots.values()]);
  }
  return result;
}

function repeatedModifierCount(graph: SceneGraph): number {
  const counts = new Map<string, number>();
  for (const entity of graph.entities) {
    for (const attribute of entity.attributes) {
      const key = `${attribute.slot}:${attribute.value.toLocaleLowerCase("en-US")}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
}

export function calculateClutterPressure(graph: SceneGraph): ClutterPressure {
  const attributeCount = graph.entities.reduce(
    (count, entity) => count + entity.attributes.length,
    0
  );
  const objectCount =
    graph.setting.objects.length +
    graph.entities.filter((entity) => entity.kind === "object").length;
  const spatialConstraints = graph.entities.reduce(
    (count, entity) =>
      count +
      entity.attributes.filter((attribute) => attribute.slot === "relative_position").length,
    0
  );
  const repeatedModifiers = repeatedModifierCount(graph);
  const dialogueArea = graph.dialogue.reduce(
    (total, dialogue) => total + Math.ceil(dialogue.content.text.length / 24),
    0
  );
  const contributors = {
    attributes: attributeCount,
    objects: objectCount,
    spatialConstraints,
    repeatedModifiers,
    actions: graph.actions.length,
    dialogueArea
  };
  const score =
    attributeCount * 1.25 +
    objectCount * 1.75 +
    spatialConstraints * 2 +
    repeatedModifiers * 2 +
    Math.max(0, graph.actions.length - 1) * 2.5 +
    dialogueArea * 0.75;
  const threshold = 16;
  return {
    score: Math.round(score * 100) / 100,
    threshold,
    active: score > threshold,
    contributors
  };
}

export class RenderCompiler {
  compile(graph: SceneGraph, options: CompileOptions): RenderContract {
    const inherited = options.inheritedIdentity ?? new Map();
    const resolvedIdentity = identityAttributes(graph, inherited);
    const explicitFacts: ExplicitVisualFact[] = [];
    const pencilSlots: PencilSlot[] = [];

    for (const [entityIndex, entity] of graph.entities.entries()) {
      explicitFacts.push(
        fact(
          `entity:${entityIndex}:presence`,
          entity.entityId,
          "presence",
          "kind",
          `${entity.kind}:${entity.label.value}`,
          entity.label.evidence
        )
      );

      const seen = new Set<AttributeSlot>();
      const attributes = [
        ...(resolvedIdentity.get(entity.entityId) ?? []),
        ...entity.attributes.filter((attribute) => attribute.scope === "panel_state")
      ];
      for (const [attributeIndex, attribute] of attributes.entries()) {
        if (seen.has(attribute.slot)) continue;
        seen.add(attribute.slot);
        explicitFacts.push(
          fact(
            `entity:${entityIndex}:attribute:${attributeIndex}`,
            entity.entityId,
            attribute.scope === "identity_from_here" ? "identity" : "state",
            attribute.slot,
            attribute.value,
            attribute.evidence
          )
        );
      }
      for (const requiredSlot of REQUIRED_IDENTITY_SLOTS) {
        if (!seen.has(requiredSlot)) {
          pencilSlots.push({
            entityId: entity.entityId,
            slot: requiredSlot,
            treatment: "gray_pencil",
            reason: "present_but_unspecified"
          });
        }
      }
    }

    for (const [actionIndex, action] of graph.actions.entries()) {
      explicitFacts.push(
        fact(
          `action:${actionIndex}`,
          action.agentId,
          "action",
          "verb",
          [
            action.verb,
            action.targetId ? `target=${action.targetId}` : "",
            action.instrumentId ? `instrument=${action.instrumentId}` : "",
            action.manner ? `manner=${action.manner}` : "",
            action.direction ? `direction=${action.direction}` : "",
            action.result ? `result=${action.result}` : ""
          ].filter(Boolean).join(";"),
          action.evidence
        )
      );
    }

    const settingSlots = [
      ["place", graph.setting.place],
      ["time", graph.setting.time],
      ["weather", graph.setting.weather],
      ["lighting", graph.setting.lighting]
    ] as const;
    let hasSetting = false;
    for (const [slot, settingValue] of settingSlots) {
      if (!settingValue) continue;
      hasSetting = true;
      explicitFacts.push(
        fact(`setting:${slot}`, null, "setting", slot, settingValue.value, settingValue.evidence)
      );
    }
    for (const [index, object] of graph.setting.objects.entries()) {
      hasSetting = true;
      explicitFacts.push(
        fact(`setting:object:${index}`, null, "setting", "object", object.value, object.evidence)
      );
    }
    if (!hasSetting) {
      pencilSlots.push({
        entityId: null,
        slot: "setting",
        treatment: "blank_paper",
        reason: "setting_unspecified"
      });
    }

    for (const [index, marker] of graph.sequenceMarkers.entries()) {
      explicitFacts.push(
        fact(`composition:${index}`, null, "composition", "sequence", marker.value, marker.evidence)
      );
    }

    explicitFacts.sort((a, b) =>
      a.evidence.start - b.evidence.start || a.factId.localeCompare(b.factId)
    );
    pencilSlots.sort((a, b) =>
      `${a.entityId ?? ""}:${a.slot}`.localeCompare(`${b.entityId ?? ""}:${b.slot}`)
    );

    return {
      contractVersion: RENDER_CONTRACT_VERSION,
      compilerVersion: COMPILER_VERSION,
      sourceHash: graph.sourceHash,
      styleVersion: options.styleVersion,
      modelPolicyVersion: options.modelPolicyVersion,
      explicitFacts,
      pencilSlots,
      absentObjects: [],
      prohibitedAdditions: [
        "No readable text, captions, labels, signatures, or watermarks.",
        "Do not add concrete characters, props, clothing, scenery, weather, expressions, or actions without an explicit fact.",
        "Do not translate internal feelings into facial expressions, poses, tears, shaking, hiding, or gestures.",
        "Render each required pencil slot as provisional gray pencil or blank paper exactly as specified."
      ],
      characterReferenceVersions: { ...(options.characterReferenceVersions ?? {}) },
      clutterPressure: calculateClutterPressure(graph),
      dialogueOverlay: graph.dialogue.map((dialogue) => ({
        speakerId: dialogue.speakerId,
        exactText: dialogue.content.text,
        source: dialogue.content
      }))
    };
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalValue(child)])
    );
  }
  return value;
}

export function canonicalizeRenderContract(contract: RenderContract): string {
  return JSON.stringify(canonicalValue(contract));
}

export function hashRenderContract(contract: RenderContract): string {
  return `sha256:${createHash("sha256")
    .update(canonicalizeRenderContract(contract), "utf8")
    .digest("hex")}`;
}

function visualRenderValue(contract: RenderContract): unknown {
  return {
    contractVersion: contract.contractVersion,
    compilerVersion: contract.compilerVersion,
    styleVersion: contract.styleVersion,
    modelPolicyVersion: contract.modelPolicyVersion,
    explicitFacts: contract.explicitFacts.map((fact) => ({
      entityId: fact.entityId,
      category: fact.category,
      slot: fact.slot,
      value: fact.value
    })),
    pencilSlots: contract.pencilSlots,
    absentObjects: contract.absentObjects,
    prohibitedAdditions: contract.prohibitedAdditions,
    characterReferenceVersions: contract.characterReferenceVersions
  };
}

/**
 * Hashes only facts that can affect the raw illustration. Source offsets,
 * punctuation, evidence text, fact numbering, and locally composed dialogue
 * deliberately do not invalidate a reusable image.
 */
export function hashVisualRenderContract(contract: RenderContract): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalValue(visualRenderValue(contract))), "utf8")
    .digest("hex")}`;
}

export type RenderPlan = "NO_VISUAL_CHANGE" | "DIALOGUE_ONLY" | "LOCAL_EDIT" | "FULL_RENDER";

export function chooseRenderPlan(
  previous: RenderContract | null,
  current: RenderContract
): RenderPlan {
  if (!previous) return "FULL_RENDER";
  const sameVisual =
    hashVisualRenderContract(previous) === hashVisualRenderContract(current);
  const sameDialogue =
    JSON.stringify(previous.dialogueOverlay) === JSON.stringify(current.dialogueOverlay);
  if (sameVisual && sameDialogue) return "NO_VISUAL_CHANGE";
  if (sameVisual) return "DIALOGUE_ONLY";

  const previousById = new Map(previous.explicitFacts.map((item) => [item.factId, item]));
  const changedFacts = current.explicitFacts.filter(
    (item) => JSON.stringify(item) !== JSON.stringify(previousById.get(item.factId))
  );
  const previousPencil = new Set(
    previous.pencilSlots.map((slot) => `${slot.entityId ?? ""}:${slot.slot}`)
  );
  const changedPencil = current.pencilSlots.filter(
    (slot) => !previousPencil.has(`${slot.entityId ?? ""}:${slot.slot}`)
  );
  return changedFacts.length + changedPencil.length === 1 ? "LOCAL_EDIT" : "FULL_RENDER";
}

export function isGenericAction(verb: string): boolean {
  return GENERIC_ACTIONS.has(verb.toLocaleLowerCase("en-US"));
}
