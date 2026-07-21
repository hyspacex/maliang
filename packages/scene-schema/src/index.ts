import { z } from "zod";
import {
  ATTRIBUTE_SLOTS,
  DIAGNOSTIC_CODES,
  type SceneGraph
} from "@maliang/domain";

export const evidenceRangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  text: z.string()
}).strict();

const spanIdSchema = z.string().regex(/^s[0-9]+$/);
const spanIdsSchema = z.array(spanIdSchema).min(1).max(32);

const evidenceValueSchema = z.object({
  value: z.string().max(240),
  evidence: evidenceRangeSchema
}).strict();

const extractionEvidenceValueSchema = z.object({
  value: z.string().max(240),
  spanIds: spanIdsSchema
}).strict();

export const sceneExtractionDraftSchema = z.object({
  entities: z.array(z.object({
    ref: z.string().max(16).regex(/^e[1-9][0-9]*$/),
    kind: z.enum(["character", "animal", "object", "place", "group"]),
    labelSpanId: spanIdSchema,
    attributes: z.array(z.object({
      slot: z.enum(ATTRIBUTE_SLOTS),
      value: z.string().max(240),
      scope: z.enum(["identity_from_here", "panel_state"]),
      spanIds: spanIdsSchema
    }).strict()).max(24)
  }).strict()).max(24),
  actions: z.array(z.object({
    agentRef: z.string().max(16),
    verb: z.string().max(120),
    targetRef: z.string().max(16).nullable(),
    instrumentRef: z.string().max(16).nullable(),
    manner: z.string().max(240).nullable(),
    direction: z.string().max(240).nullable(),
    result: z.string().max(240).nullable(),
    spanIds: spanIdsSchema
  }).strict()).max(16),
  setting: z.object({
    place: extractionEvidenceValueSchema.nullable(),
    time: extractionEvidenceValueSchema.nullable(),
    weather: extractionEvidenceValueSchema.nullable(),
    lighting: extractionEvidenceValueSchema.nullable(),
    objects: z.array(extractionEvidenceValueSchema).max(20)
  }).strict(),
  internalStates: z.array(z.object({
    entityRef: z.string().max(16),
    state: z.string().max(240),
    spanIds: spanIdsSchema
  }).strict()).max(12),
  dialogue: z.array(z.object({
    speakerRef: z.string().max(16).nullable(),
    contentSpanIds: spanIdsSchema,
    quoteStartSpanId: spanIdSchema,
    quoteEndSpanId: spanIdSchema
  }).strict()).max(8),
  sequenceMarkers: z.array(extractionEvidenceValueSchema).max(12),
  diagnostics: z.array(z.enum(DIAGNOSTIC_CODES)).max(12)
}).strict();

export const sceneGraphSchema = z.object({
  schemaVersion: z.literal(1),
  sourceHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  entities: z.array(z.object({
    entityId: z.string().max(80).regex(/^[a-z][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*$/),
    kind: z.enum(["character", "animal", "object", "place", "group"]),
    label: evidenceValueSchema,
    attributes: z.array(z.object({
      slot: z.enum(ATTRIBUTE_SLOTS),
      value: z.string().max(240),
      scope: z.enum(["identity_from_here", "panel_state"]),
      evidence: evidenceRangeSchema
    }).strict()).max(24)
  }).strict()).max(24),
  actions: z.array(z.object({
    agentId: z.string().max(80),
    verb: z.string().max(120),
    targetId: z.string().max(80).optional(),
    instrumentId: z.string().max(80).optional(),
    manner: z.string().max(240).optional(),
    direction: z.string().max(240).optional(),
    result: z.string().max(240).optional(),
    evidence: evidenceRangeSchema
  }).strict()).max(16),
  setting: z.object({
    place: evidenceValueSchema.nullable(),
    time: evidenceValueSchema.nullable(),
    weather: evidenceValueSchema.nullable(),
    lighting: evidenceValueSchema.nullable(),
    objects: z.array(evidenceValueSchema).max(20)
  }).strict(),
  internalStates: z.array(z.object({
    entityId: z.string().max(80),
    state: z.string().max(240),
    evidence: evidenceRangeSchema
  }).strict()).max(12),
  dialogue: z.array(z.object({
    speakerId: z.string().max(80).nullable(),
    content: evidenceRangeSchema,
    quoteStart: z.number().int().nonnegative(),
    quoteEnd: z.number().int().nonnegative()
  }).strict()).max(8),
  sequenceMarkers: z.array(evidenceValueSchema).max(12),
  diagnostics: z.array(z.enum(DIAGNOSTIC_CODES)).max(12)
}).strict();

export type SceneGraphCandidate = z.input<typeof sceneGraphSchema>;
export type SceneExtractionDraft = z.infer<typeof sceneExtractionDraftSchema>;

export function parseSceneGraph(input: unknown): SceneGraph {
  return sceneGraphSchema.parse(input) as SceneGraph;
}

export function parseSceneExtractionDraft(input: unknown): SceneExtractionDraft {
  return sceneExtractionDraftSchema.parse(input);
}

export function sceneExtractionDraftJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(sceneExtractionDraftSchema, {
    target: "draft-7",
    io: "output"
  }) as Record<string, unknown>;
}

export function sceneGraphJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(sceneGraphSchema, {
    target: "draft-7",
    io: "output"
  }) as Record<string, unknown>;
  const rootProperties = schema.properties as Record<string, unknown>;
  const actions = rootProperties.actions as Record<string, unknown>;
  const actionItems = actions.items as Record<string, unknown>;
  const actionProperties = actionItems.properties as Record<string, unknown>;
  const optionalActionKeys = [
    "targetId",
    "instrumentId",
    "manner",
    "direction",
    "result"
  ] as const;
  for (const key of optionalActionKeys) {
    actionProperties[key] = {
      anyOf: [
        actionProperties[key],
        { type: "null" }
      ]
    };
  }
  actionItems.required = Object.keys(actionProperties);
  return schema;
}
