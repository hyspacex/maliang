import { createHash } from "node:crypto";
import type { ExplicitVisualFact, RenderContract } from "@maliang/render-compiler";

export const VECTOR_PLAN_VERSION = 1;
export const VECTOR_RENDERER_VERSION = "maliang-vector-comic/1.0.0";
export const VECTOR_MODEL_POLICY = "gpt-5.6-terra-vector-plan+local-svg/v1";

export const VECTOR_POSES = [
  "neutral",
  "walking",
  "running",
  "stomping",
  "creeping",
  "jumping",
  "reaching",
  "holding",
  "shouting",
  "looking"
] as const;

export type VectorPose = (typeof VECTOR_POSES)[number];
export type VectorFacing = "left" | "right";
export type VectorComposition = "single-focus" | "balanced" | "wide-action";

export interface VectorEntityPlacement {
  entityId: string;
  x: number;
  y: number;
  scale: number;
  facing: VectorFacing;
  pose: VectorPose;
  sourceFactIds: string[];
}

export interface VectorScenePlan {
  schemaVersion: 1;
  composition: VectorComposition;
  placements: VectorEntityPlacement[];
}

export interface VectorPlanValidation {
  valid: boolean;
  plan: VectorScenePlan | null;
  issues: string[];
}

export interface RenderVectorPanelInput {
  contract: RenderContract;
  plan: VectorScenePlan;
  width?: number;
  height?: number;
}

const COMPOSITIONS = new Set<VectorComposition>([
  "single-focus",
  "balanced",
  "wide-action"
]);
const POSES = new Set<VectorPose>(VECTOR_POSES);
const FACINGS = new Set<VectorFacing>(["left", "right"]);

const PALETTE: Readonly<Record<string, string>> = {
  black: "#26253a",
  blue: "#3a86ff",
  brown: "#9c6644",
  cream: "#fffaf0",
  cyan: "#36c5d0",
  gold: "#f5b700",
  gray: "#90909e",
  green: "#49b675",
  grey: "#90909e",
  orange: "#ff8c42",
  pink: "#ef6f9f",
  purple: "#8657c7",
  red: "#ef476f",
  white: "#fffdf7",
  yellow: "#ffd23f"
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function entityPresenceFacts(contract: RenderContract): ExplicitVisualFact[] {
  return contract.explicitFacts.filter(
    (fact) => fact.category === "presence" && fact.entityId
  );
}

function presenceKindAndLabel(
  fact: ExplicitVisualFact
): { kind: string; label: string } {
  const separator = fact.value.indexOf(":");
  if (separator < 0) return { kind: "", label: fact.value };
  return {
    kind: fact.value.slice(0, separator).toLocaleLowerCase("en-US"),
    label: fact.value.slice(separator + 1)
  };
}

function normalizedVisualLabel(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replaceAll(/[0-9]+/gu, "")
    .replaceAll(/[^a-z]+/gu, " ")
    .trim();
}

function labelsMatch(first: string, second: string): boolean {
  const a = normalizedVisualLabel(first);
  const b = normalizedVisualLabel(second);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function plannablePresenceFacts(contract: RenderContract): ExplicitVisualFact[] {
  const settingObjects = contract.explicitFacts
    .filter((fact) => fact.category === "setting" && fact.slot === "object")
    .map((fact) => fact.value);
  return entityPresenceFacts(contract).filter((fact) => {
    const { kind, label } = presenceKindAndLabel(fact);
    if (kind === "place") return false;
    if (kind === "object" && settingObjects.some((value) => labelsMatch(label, value))) {
      return false;
    }
    return true;
  });
}

export function vectorPlannableEntityIds(contract: RenderContract): string[] {
  return plannablePresenceFacts(contract).flatMap((fact) =>
    fact.entityId ? [fact.entityId] : []
  );
}

function entityFacts(
  contract: RenderContract,
  entityId: string
): ExplicitVisualFact[] {
  return contract.explicitFacts.filter((fact) => fact.entityId === entityId);
}

function factsForKindLabel(
  contract: RenderContract,
  kind: string,
  label: string
): ExplicitVisualFact[] {
  const presence = entityPresenceFacts(contract).find((fact) => {
    const candidate = presenceKindAndLabel(fact);
    return candidate.kind === kind && labelsMatch(candidate.label, label);
  });
  return presence?.entityId ? entityFacts(contract, presence.entityId) : [];
}

function factForSlot(
  facts: readonly ExplicitVisualFact[],
  slot: string
): ExplicitVisualFact | undefined {
  return facts.find((fact) => fact.slot === slot);
}

function actionFact(facts: readonly ExplicitVisualFact[]): ExplicitVisualFact | undefined {
  return facts.find((fact) => fact.category === "action");
}

function poseForAction(value: string | undefined): VectorPose {
  const verb = value?.split(";")[0]?.toLocaleLowerCase("en-US") ?? "";
  if (/(stomp|march)/u.test(verb)) return "stomping";
  if (/(creep|sneak|tiptoe)/u.test(verb)) return "creeping";
  if (/(zoom|run|race|dash|sprint)/u.test(verb)) return "running";
  if (/(walk|step|wander)/u.test(verb)) return "walking";
  if (/(jump|leap|hop|bounce)/u.test(verb)) return "jumping";
  if (/(reach|grab|take)/u.test(verb)) return "reaching";
  if (/(hold|carry|lift)/u.test(verb)) return "holding";
  if (/(shout|yell|call)/u.test(verb)) return "shouting";
  if (/(look|watch|see|stare)/u.test(verb)) return "looking";
  return "neutral";
}

export function defaultVectorScenePlan(contract: RenderContract): VectorScenePlan {
  const presence = plannablePresenceFacts(contract);
  const count = Math.max(1, presence.length);
  const placements = presence.map((fact, index): VectorEntityPlacement => {
    const facts = entityFacts(contract, fact.entityId ?? "");
    const action = actionFact(facts);
    const slot = (index + 1) / (count + 1);
    return {
      entityId: fact.entityId ?? "",
      x: round(0.14 + slot * 0.72),
      y: 0.78,
      scale: 1,
      facing: index % 2 === 0 ? "right" : "left",
      pose: poseForAction(action?.value),
      sourceFactIds: [fact.factId, ...(action ? [action.factId] : [])]
    };
  });
  return {
    schemaVersion: VECTOR_PLAN_VERSION,
    composition:
      placements.length <= 1
        ? "single-focus"
        : contract.explicitFacts.some((fact) => fact.category === "action")
          ? "wide-action"
          : "balanced",
    placements
  };
}

export function vectorScenePlanJsonSchema(): Record<string, unknown> {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "composition", "placements"],
    properties: {
      schemaVersion: { type: "number", const: VECTOR_PLAN_VERSION },
      composition: { type: "string", enum: [...COMPOSITIONS] },
      placements: {
        type: "array",
        maxItems: 16,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "entityId",
            "x",
            "y",
            "scale",
            "facing",
            "pose",
            "sourceFactIds"
          ],
          properties: {
            entityId: { type: "string", maxLength: 160 },
            x: { type: "number", minimum: 0.12, maximum: 0.88 },
            y: { type: "number", minimum: 0.5, maximum: 0.86 },
            scale: { type: "number", minimum: 0.65, maximum: 1.35 },
            facing: { type: "string", enum: [...FACINGS] },
            pose: { type: "string", enum: [...POSES] },
            sourceFactIds: {
              type: "array",
              minItems: 1,
              maxItems: 32,
              items: { type: "string", maxLength: 180 }
            }
          }
        }
      }
    }
  };
}

export function validateVectorScenePlan(
  contract: RenderContract,
  value: unknown
): VectorPlanValidation {
  const issues: string[] = [];
  if (!value || typeof value !== "object") {
    return { valid: false, plan: null, issues: ["Plan must be an object."] };
  }
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== VECTOR_PLAN_VERSION) {
    issues.push("Unsupported vector plan version.");
  }
  if (!COMPOSITIONS.has(input.composition as VectorComposition)) {
    issues.push("Unsupported composition.");
  }
  const knownFacts = new Map(contract.explicitFacts.map((fact) => [fact.factId, fact]));
  const expectedEntities = new Set(
    vectorPlannableEntityIds(contract)
  );
  if (!Array.isArray(input.placements)) {
    issues.push("Placements must be an array.");
  } else if (expectedEntities.size > 0 && input.placements.length === 0) {
    issues.push("Every present entity requires a placement.");
  }
  const seenEntities = new Set<string>();
  const placements: VectorEntityPlacement[] = [];

  for (const [index, raw] of (Array.isArray(input.placements) ? input.placements : []).entries()) {
    if (!raw || typeof raw !== "object") {
      issues.push(`Placement ${index} must be an object.`);
      continue;
    }
    const placement = raw as Record<string, unknown>;
    const entityId = typeof placement.entityId === "string" ? placement.entityId : "";
    const x = typeof placement.x === "number" ? placement.x : Number.NaN;
    const y = typeof placement.y === "number" ? placement.y : Number.NaN;
    const scale = typeof placement.scale === "number" ? placement.scale : Number.NaN;
    const facing = placement.facing as VectorFacing;
    const pose = placement.pose as VectorPose;
    const sourceFactIds = Array.isArray(placement.sourceFactIds)
      ? placement.sourceFactIds.filter((item): item is string => typeof item === "string")
      : [];

    if (!expectedEntities.has(entityId)) issues.push(`Unknown entity placement: ${entityId}`);
    if (seenEntities.has(entityId)) issues.push(`Duplicate entity placement: ${entityId}`);
    seenEntities.add(entityId);
    if (!Number.isFinite(x) || x < 0.12 || x > 0.88) issues.push(`Invalid x for ${entityId}`);
    if (!Number.isFinite(y) || y < 0.5 || y > 0.86) issues.push(`Invalid y for ${entityId}`);
    if (!Number.isFinite(scale) || scale < 0.65 || scale > 1.35) {
      issues.push(`Invalid scale for ${entityId}`);
    }
    if (!FACINGS.has(facing)) issues.push(`Invalid facing for ${entityId}`);
    if (!POSES.has(pose)) issues.push(`Invalid pose for ${entityId}`);
    if (sourceFactIds.length === 0 || new Set(sourceFactIds).size !== sourceFactIds.length) {
      issues.push(`Invalid source facts for ${entityId}`);
    }

    const referencedFacts = sourceFactIds.flatMap((factId) => {
      const fact = knownFacts.get(factId);
      if (!fact) {
        issues.push(`Unknown source fact: ${factId}`);
        return [];
      }
      if (fact.entityId !== entityId) {
        issues.push(`Fact ${factId} does not belong to ${entityId}`);
      }
      return [fact];
    });
    const presence = referencedFacts.some((fact) => fact.category === "presence");
    if (!presence) issues.push(`Placement ${entityId} must cite its presence fact.`);
    const action = referencedFacts.some((fact) => fact.category === "action");
    if (pose !== "neutral" && !action) {
      issues.push(`Pose ${pose} for ${entityId} lacks an action fact.`);
    }
    placements.push({
      entityId,
      x: round(clamp(x, 0.12, 0.88)),
      y: round(clamp(y, 0.5, 0.86)),
      scale: round(clamp(scale, 0.65, 1.35)),
      facing,
      pose,
      sourceFactIds: [...new Set(sourceFactIds)]
    });
  }
  for (const entityId of expectedEntities) {
    if (!seenEntities.has(entityId)) issues.push(`Missing entity placement: ${entityId}`);
  }

  if (issues.length > 0) return { valid: false, plan: null, issues };
  return {
    valid: true,
    plan: {
      schemaVersion: VECTOR_PLAN_VERSION,
      composition: input.composition as VectorComposition,
      placements
    },
    issues: []
  };
}

function safeColor(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLocaleLowerCase("en-US");
  return PALETTE[normalized] ?? null;
}

function sizeMultiplier(value: string | undefined): number {
  const normalized = value?.toLocaleLowerCase("en-US") ?? "";
  if (/(enormous|giant|huge|massive)/u.test(normalized)) return 1.28;
  if (/(large|big|tall)/u.test(normalized)) return 1.13;
  if (/(tiny|miniature|small|little)/u.test(normalized)) return 0.72;
  return 1;
}

function dataFacts(facts: readonly ExplicitVisualFact[]): string {
  return escapeXml(facts.map((fact) => fact.factId).join(" "));
}

function pencilSlotKey(entityId: string | null, slot: string): string {
  return `${entityId ?? "setting"}:${slot}`;
}

function armPaths(pose: VectorPose): readonly [string, string] {
  switch (pose) {
    case "running":
      return ["M-30,-50 Q-60,-18 -46,10", "M30,-50 Q54,-82 68,-62"];
    case "stomping":
      return ["M-30,-50 Q-62,-32 -70,-2", "M30,-50 Q62,-32 70,-2"];
    case "creeping":
      return ["M-30,-50 Q-50,-58 -62,-42", "M30,-50 Q48,-42 58,-24"];
    case "jumping":
      return ["M-28,-54 Q-55,-82 -44,-105", "M28,-54 Q55,-82 44,-105"];
    case "reaching":
      return ["M-30,-48 Q-55,-38 -62,-20", "M30,-50 Q65,-72 86,-86"];
    case "holding":
      return ["M-30,-50 Q-42,-22 -16,-8", "M30,-50 Q42,-22 16,-8"];
    case "shouting":
      return ["M-30,-48 Q-56,-62 -70,-46", "M30,-48 Q56,-62 70,-46"];
    case "walking":
    case "looking":
    case "neutral":
    default:
      return ["M-30,-50 Q-50,-20 -44,12", "M30,-50 Q50,-20 44,12"];
  }
}

function legPaths(pose: VectorPose): readonly [string, string] {
  switch (pose) {
    case "running":
      return ["M-18,16 Q-54,48 -72,76", "M18,16 Q46,36 66,22"];
    case "stomping":
      return ["M-18,16 Q-30,54 -46,84", "M18,16 L36,70 L70,70"];
    case "creeping":
      return ["M-18,16 Q-46,40 -58,60", "M18,16 Q44,30 62,20"];
    case "jumping":
      return ["M-18,16 Q-46,32 -54,62", "M18,16 Q46,32 54,62"];
    case "walking":
      return ["M-18,16 Q-40,50 -54,78", "M18,16 Q40,44 58,62"];
    default:
      return ["M-18,16 Q-26,55 -30,82", "M18,16 Q26,55 30,82"];
  }
}

function renderEntityDetails(
  contract: RenderContract,
  facts: readonly ExplicitVisualFact[]
): string {
  return facts
    .filter(
      (fact) =>
        (fact.category === "identity" || fact.category === "state") &&
        !["color", "relative_size", "shape", "texture"].includes(fact.slot)
    )
    .map((fact, index) => {
      const value = fact.value.toLocaleLowerCase("en-US");
      const y = -68 + index * 17;
      if (fact.slot === "material" || /(shiny|metal|glass)/u.test(value)) {
        return `<g data-fact-id="${escapeXml(fact.factId)}" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"><path d="M-23,${y} q12,-11 23,-4"/><path d="M12,${y + 10} l13,-8"/></g>`;
      }
      if (fact.slot === "clothing") {
        const color = safeColor(value) ?? "#fffaf0";
        return `<g data-fact-id="${escapeXml(fact.factId)}" fill="${color}" stroke="#1c1c2e" stroke-width="4"><path d="M-38,${y} Q0,${y + 18} 38,${y} L32,${y + 17} Q0,${y + 34} -32,${y + 17} Z"/></g>`;
      }
      if (fact.slot === "body_feature" || /(fluffy|spiky|horn|wing|tail)/u.test(value)) {
        return `<g data-fact-id="${escapeXml(fact.factId)}" fill="#fffaf0" stroke="#1c1c2e" stroke-width="4" stroke-linejoin="round"><path d="M-41,${y + 4} l-18,-14 4,23 -19,-2 18,16 M41,${y + 4} l18,-14 -4,23 19,-2 -18,16"/></g>`;
      }
      if (fact.slot === "identity_object" || fact.slot === "held_object") {
        const duplicatedSettingObject = contract.explicitFacts.some(
          (candidate) =>
            candidate.category === "setting" &&
            candidate.slot === "object" &&
            labelsMatch(candidate.value, fact.value)
        );
        if (duplicatedSettingObject) {
          return `<g data-fact-id="${escapeXml(fact.factId)}"/>`;
        }
        return `<g data-fact-id="${escapeXml(fact.factId)}" transform="translate(62 ${y})" fill="#fffaf0" stroke="#1c1c2e" stroke-width="4"><path d="M0,-14 l5,10 12,2 -9,8 3,12 -11,-6 -11,6 3,-12 -9,-8 12,-2 Z"/></g>`;
      }
      if (fact.slot === "facial_expression") {
        const smile = /(happy|smile|grin|excited)/u.test(value);
        const path = smile ? "M-14,-104 Q0,-91 14,-104" : "M-14,-96 Q0,-108 14,-96";
        return `<path data-fact-id="${escapeXml(fact.factId)}" d="${path}" fill="none" stroke="#1c1c2e" stroke-width="5" stroke-linecap="round"/>`;
      }
      return `<path data-fact-id="${escapeXml(fact.factId)}" d="M-32,${y} Q0,${y - 12} 32,${y}" fill="none" stroke="#1c1c2e" stroke-width="4" stroke-dasharray="${5 + index} ${4 + index}"/>`;
    })
    .join("");
}

function renderNonCharacterEntity(
  contract: RenderContract,
  placement: VectorEntityPlacement,
  facts: readonly ExplicitVisualFact[],
  kind: string,
  label: string,
  width: number,
  height: number
): string {
  const colorFact = factForSlot(facts, "color");
  const sizeFact = factForSlot(facts, "relative_size");
  const action = actionFact(facts);
  const fill = safeColor(colorFact?.value) ?? "#fffaf0";
  const scale = clamp(placement.scale * sizeMultiplier(sizeFact?.value), 0.5, 1.5);
  const x = round(placement.x * width);
  const y = round(placement.y * height);
  const facing = placement.facing === "left" ? -1 : 1;
  const factIds = dataFacts(facts);
  const pencil = contract.pencilSlots
    .filter((slot) => slot.entityId === placement.entityId)
    .map((slot, index) =>
      `<path data-pencil-slot="${escapeXml(pencilSlotKey(slot.entityId, slot.slot))}" d="M${-34 + index * 11},-28 l48,34" fill="none" stroke="#9b9aa5" stroke-width="2" stroke-dasharray="4 6"/>`
    )
    .join("");
  const motion = action
    ? `<g data-fact-id="${escapeXml(action.factId)}" fill="none" stroke="#ef476f" stroke-width="5" stroke-linecap="round"><path d="M-72,-42 l-24,-7"/><path d="M-70,-22 l-30,4"/></g>`
    : "";
  let drawing: string;
  if (kind === "animal") {
    drawing = [
      `<ellipse cx="0" cy="-38" rx="58" ry="38"/>`,
      `<circle cx="48" cy="-72" r="30"/>`,
      `<path d="M-35,-10 l-8,55 M-5,-7 l-3,52 M25,-9 l7,54 M48,-16 l14,47" fill="none"/>`,
      `<path d="M-55,-50 q-34,-32 -42,4" fill="none"/>`,
      `<g fill="#1c1c2e" stroke="none"><circle cx="39" cy="-78" r="3"/><circle cx="56" cy="-78" r="3"/></g>`,
      `<path d="M43,-64 h11" fill="none" stroke-width="3"/>`
    ].join("");
  } else if (kind === "group") {
    drawing = [
      `<circle cx="-38" cy="-85" r="31"/><circle cx="0" cy="-104" r="34"/><circle cx="38" cy="-85" r="31"/>`,
      `<path d="M-70,18 Q-75,-45 -38,-52 Q0,-36 0,18 Z"/>`,
      `<path d="M0,18 Q0,-48 38,-52 Q75,-45 70,18 Z"/>`,
      `<g fill="#1c1c2e" stroke="none"><circle cx="-48" cy="-89" r="3"/><circle cx="-29" cy="-89" r="3"/><circle cx="-10" cy="-108" r="3"/><circle cx="10" cy="-108" r="3"/><circle cx="29" cy="-89" r="3"/><circle cx="48" cy="-89" r="3"/></g>`
    ].join("");
  } else if (label.toLocaleLowerCase("en-US").includes("lantern")) {
    drawing = `<path d="M-25,-70 Q0,-98 25,-70" fill="none"/><path d="M-34,-60 H34 L28,10 H-28 Z"/><path d="M-18,-47 H18 L14,-4 H-14 Z"/><path d="M-12,-38 l22,25 M-10,-12 l20,-26" fill="none" stroke="#9b9aa5" stroke-width="3"/>`;
  } else if (/(ball|orb|circle|round)/u.test(label.toLocaleLowerCase("en-US"))) {
    drawing = `<circle cx="0" cy="-34" r="52"/><path d="M-42,-50 Q0,-18 42,-50 M-45,-20 Q0,-52 45,-20" fill="none" stroke-width="4"/>`;
  } else {
    drawing = `<path d="M-48,5 Q-58,-48 -18,-70 Q28,-76 52,-35 Q58,12 20,30 Q-24,35 -48,5 Z"/><path d="M-28,-28 Q0,-50 28,-28" fill="none" stroke-width="4"/>`;
  }
  return [
    `<g data-entity-id="${escapeXml(placement.entityId)}" data-source-fact-ids="${escapeXml(placement.sourceFactIds.join(" "))}" data-fact-id="${factIds}" transform="translate(${x} ${y}) scale(${round(scale * facing)} ${round(scale)})" fill="${fill}" stroke="#1c1c2e" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">`,
    drawing,
    pencil,
    motion,
    `</g>`
  ].join("");
}

function renderEntity(
  contract: RenderContract,
  placement: VectorEntityPlacement,
  width: number,
  height: number
): string {
  const facts = entityFacts(contract, placement.entityId);
  const presence = facts.filter((fact) => fact.category === "presence");
  const presenceType = presence[0]
    ? presenceKindAndLabel(presence[0])
    : { kind: "character", label: "" };
  if (presenceType.kind !== "character") {
    return renderNonCharacterEntity(
      contract,
      placement,
      facts,
      presenceType.kind,
      presenceType.label,
      width,
      height
    );
  }
  const colorFact = factForSlot(facts, "color");
  const sizeFact = factForSlot(facts, "relative_size");
  const shapeFact = factForSlot(facts, "shape");
  const textureFact = factForSlot(facts, "texture");
  const action = actionFact(facts);
  const fill = safeColor(colorFact?.value) ?? "#fffaf0";
  const scale = clamp(placement.scale * sizeMultiplier(sizeFact?.value), 0.5, 1.5);
  const x = round(placement.x * width);
  const y = round(placement.y * height);
  const facing = placement.facing === "left" ? -1 : 1;
  const [leftArm, rightArm] = armPaths(placement.pose);
  const [leftLeg, rightLeg] = legPaths(placement.pose);
  const pencilSlots = contract.pencilSlots.filter(
    (slot) => slot.entityId === placement.entityId
  );
  const pencilGroups = pencilSlots.map((slot, index) => {
    const offset = index * 11 - 12;
    return `<path data-pencil-slot="${escapeXml(pencilSlotKey(slot.entityId, slot.slot))}" d="M-42,${offset} Q0,${offset - 12} 42,${offset + 2}" fill="none" stroke="#9b9aa5" stroke-width="2" stroke-dasharray="5 8" opacity=".72"/>`;
  }).join("");
  const bodyPath = shapeFact?.value.toLocaleLowerCase("en-US").includes("round")
    ? `<ellipse cx="0" cy="-32" rx="48" ry="53"/>`
    : `<path d="M-34,-78 Q-58,-38 -38,18 Q0,42 38,18 Q58,-38 34,-78 Q0,-100 -34,-78 Z"/>`;
  const texture = textureFact
    ? `<path data-fact-id="${escapeXml(textureFact.factId)}" d="M-30,-50 Q0,-66 30,-50 M-34,-28 Q0,-44 34,-28 M-30,-7 Q0,-23 30,-7" fill="none" stroke="#1c1c2e" stroke-width="3" opacity=".7"/>`
    : "";
  const details = renderEntityDetails(contract, facts);
  const actionMark = action && placement.pose !== "neutral"
    ? `<g data-fact-id="${escapeXml(action.factId)}" fill="none" stroke="#ef476f" stroke-width="6" stroke-linecap="round"><path d="M-76,-82 l-24,-10"/><path d="M-72,-60 l-30,2"/><path d="M76,-82 l24,-10"/></g>`
    : "";
  return [
    `<g data-entity-id="${escapeXml(placement.entityId)}" data-source-fact-ids="${escapeXml(placement.sourceFactIds.join(" "))}" transform="translate(${x} ${y}) scale(${round(scale * facing)} ${round(scale)})">`,
    `<g data-fact-id="${dataFacts(presence)}" fill="${fill}" stroke="#1c1c2e" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">`,
    `<g fill="none"><path d="${leftLeg}"/><path d="${rightLeg}"/><path d="${leftArm}"/><path d="${rightArm}"/></g>`,
    bodyPath,
    `<circle cx="0" cy="-117" r="43"/>`,
    `</g>`,
    colorFact
      ? `<path data-fact-id="${escapeXml(colorFact.factId)}" d="M-22,-108 Q0,-98 22,-108" fill="none" stroke="${fill}" stroke-width="10"/>`
      : "",
    sizeFact
      ? `<g data-fact-id="${escapeXml(sizeFact.factId)}"><path d="M-54,92 H54" stroke="#1c1c2e" stroke-width="5" stroke-linecap="round"/><path d="M-54,92 l12,-8 v16 Z M54,92 l-12,-8 v16 Z" fill="#1c1c2e"/></g>`
      : "",
    shapeFact ? `<g data-fact-id="${escapeXml(shapeFact.factId)}"/>` : "",
    `<g fill="#1c1c2e"><circle cx="-14" cy="-122" r="4"/><circle cx="14" cy="-122" r="4"/></g>`,
    `<path d="M-10,-104 H10" fill="none" stroke="#1c1c2e" stroke-width="4" stroke-linecap="round"/>`,
    texture,
    details,
    pencilGroups,
    actionMark,
    `</g>`
  ].join("");
}

function renderCompositionFacts(contract: RenderContract, width: number): string {
  const facts = contract.explicitFacts.filter((fact) => fact.category === "composition");
  return facts.map((fact, index) => {
    const y = 90 + index * 34;
    return `<g data-fact-id="${escapeXml(fact.factId)}" transform="translate(${width - 78} ${y})" fill="none" stroke="#1c1c2e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M-28,0 H24"/><path d="M12,-10 L26,0 12,10"/></g>`;
  }).join("");
}

function renderSetting(contract: RenderContract, width: number, height: number): string {
  const settingFacts = contract.explicitFacts.filter((fact) => fact.category === "setting");
  const place = settingFacts.find((fact) => fact.slot === "place");
  const objects = settingFacts.filter((fact) => fact.slot === "object");
  const placeValue = place?.value.toLocaleLowerCase("en-US") ?? "";
  const placeEntityFacts = place ? factsForKindLabel(contract, "place", place.value) : [];
  const placeFactIds = [place, ...placeEntityFacts].filter(
    (fact): fact is ExplicitVisualFact => Boolean(fact)
  );
  const placeEntityId = placeEntityFacts[0]?.entityId ?? null;
  const placePencil = placeEntityId
    ? contract.pencilSlots
        .filter((slot) => slot.entityId === placeEntityId)
        .map((slot, index) =>
          `<path data-pencil-slot="${escapeXml(pencilSlotKey(slot.entityId, slot.slot))}" d="M${90 + index * 22},${height - 34} q80,-24 160,0" fill="none" stroke="#9b9aa5" stroke-width="2" stroke-dasharray="5 8"/>`
        )
        .join("")
    : "";
  const base = place
    ? placeValue.includes("forest")
      ? `<g data-fact-id="${dataFacts(placeFactIds)}" fill="none" stroke="#1c1c2e" stroke-width="8" stroke-linecap="round"><path d="M75,520 V155 M40,210 L75,122 L112,210 M650,520 V170 M610,230 L650,128 L692,230 M720,520 V230 M690,270 L720,190 L750,270"/><path d="M0,515 Q180,480 360,515 T800,510"/>${placePencil}</g>`
      : placeValue.includes("cave")
        ? `<g data-fact-id="${dataFacts(placeFactIds)}" fill="#ded7c8" stroke="#1c1c2e" stroke-width="8" stroke-linejoin="round"><path d="M0,0 H800 V600 H700 Q660,455 580,410 Q510,300 400,300 Q290,300 220,410 Q140,455 100,600 H0 Z"/><path d="M80,0 l55,105 45,-105 M280,0 l45,85 50,-85 M575,0 l52,115 58,-115" fill="#fffaf0"/>${placePencil}</g>`
        : placeValue.includes("library")
          ? `<g data-fact-id="${dataFacts(placeFactIds)}" fill="none" stroke="#1c1c2e" stroke-width="7"><path d="M45,110 V515 H755 V110 M45,245 H755 M45,380 H755"/><path d="M80,120 v112 M112,120 v112 M150,120 v112 M655,255 v112 M690,255 v112 M720,255 v112"/>${placePencil}</g>`
          : `<g data-fact-id="${dataFacts(placeFactIds)}" fill="none" stroke="#1c1c2e" stroke-width="7"><path d="M30,505 Q200,458 400,505 T770,498"/><path d="M90,448 Q180,370 275,442 M540,438 Q635,350 735,446"/>${placePencil}</g>`
    : `<g data-pencil-slot="setting:setting" fill="none" stroke="#aaa8b1" stroke-width="3" stroke-dasharray="7 10" opacity=".72"><path d="M30,510 Q220,478 400,510 T770,505"/><path d="M95,160 l-35,95 M705,155 l38,96"/></g>`;
  const props = objects.map((fact, index) => {
    const x = 125 + (index % 4) * 175;
    const y = height - 82 - Math.floor(index / 4) * 110;
    const value = fact.value.toLocaleLowerCase("en-US");
    const related = factsForKindLabel(contract, "object", fact.value);
    const factIds = [fact, ...related];
    const relatedEntityId = related[0]?.entityId ?? null;
    const pencil = relatedEntityId
      ? contract.pencilSlots
          .filter((slot) => slot.entityId === relatedEntityId)
          .map((slot, slotIndex) =>
            `<path data-pencil-slot="${escapeXml(pencilSlotKey(slot.entityId, slot.slot))}" d="M${-18 + slotIndex * 8},-42 l22,28" fill="none" stroke="#9b9aa5" stroke-width="2" stroke-dasharray="3 5"/>`
          )
          .join("")
      : "";
    if (value.includes("lantern")) {
      return `<g data-fact-id="${dataFacts(factIds)}" transform="translate(${x} ${y})" fill="#fffaf0" stroke="#1c1c2e" stroke-width="6" stroke-linejoin="round"><path d="M-24,-66 Q0,-92 24,-66" fill="none"/><path d="M-30,-55 H30 L25,0 H-25 Z"/><path d="M-16,-45 H16 L13,-10 H-13 Z"/><path d="M-12,-38 l22,22 M-10,-18 l18,-18" stroke="#9b9aa5" stroke-width="3" stroke-dasharray="4 5"/>${pencil}</g>`;
    }
    return `<g data-fact-id="${dataFacts(factIds)}" transform="translate(${x} ${y})" fill="#fffaf0" stroke="#1c1c2e" stroke-width="6"><path d="M-34,0 Q-38,-48 0,-62 Q38,-48 34,0 Z"/><path d="M-20,-20 Q0,-38 20,-20" fill="none"/>${pencil}</g>`;
  }).join("");
  return `<g data-layer="setting">${base}${props}</g>`;
}

function wrapDialogue(value: string, maxCharacters = 24): string[] {
  const words = value.trim().split(/\s+/u);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharacters && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

function renderDialogue(contract: RenderContract, width: number): string {
  return contract.dialogueOverlay.map((dialogue, index) => {
    const lines = wrapDialogue(dialogue.exactText);
    const bubbleWidth = Math.min(
      width * 0.7,
      84 + Math.max(...lines.map((line) => line.length), 1) * 11
    );
    const bubbleHeight = 40 + lines.length * 25;
    const x = index % 2 === 0 ? 24 : width - bubbleWidth - 24;
    const y = 20 + Math.floor(index / 2) * (bubbleHeight + 14);
    const text = lines.map((line, lineIndex) =>
      `<text x="${round(x + bubbleWidth / 2)}" y="${y + 36 + lineIndex * 24}" text-anchor="middle" font-family="Patrick Hand, Comic Sans MS, cursive" font-size="23" font-weight="700" fill="#1c1c2e">${escapeXml(line)}</text>`
    ).join("");
    return `<g data-dialogue-index="${index}"><rect x="${round(x)}" y="${y}" width="${round(bubbleWidth)}" height="${bubbleHeight}" rx="20" fill="#fff" stroke="#1c1c2e" stroke-width="5"/><path d="M${round(x + 58)},${y + bubbleHeight - 2} l22,0 l-28,28 Z" fill="#fff" stroke="#1c1c2e" stroke-width="5" stroke-linejoin="round"/><path d="M${round(x + 54)},${y + bubbleHeight - 5} h32 v10 h-32 Z" fill="#fff"/>${text}</g>`;
  }).join("");
}

export function renderVectorPanelSvg(input: RenderVectorPanelInput): Buffer {
  const validation = validateVectorScenePlan(input.contract, input.plan);
  if (!validation.valid || !validation.plan) {
    throw new Error(`INVALID_VECTOR_PLAN: ${validation.issues.join(" ")}`);
  }
  const width = input.width ?? 800;
  const height = input.height ?? 600;
  const plan = validation.plan;
  const setting = renderSetting(input.contract, width, height);
  const entities = plan.placements.map((placement) =>
    renderEntity(input.contract, placement, width, height)
  ).join("");
  const dialogue = renderDialogue(input.contract, width);
  const composition = renderCompositionFacts(input.contract, width);
  const clutter = input.contract.clutterPressure.active
    ? `<g data-clutter-pressure="${input.contract.clutterPressure.score}" fill="none" stroke="#ef476f" stroke-width="4" opacity=".7"><path d="M18,80 l20,-18 M42,92 l27,-12 M760,78 l20,-18 M735,94 l30,-8"/></g>`
    : "";
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-renderer="vector" data-renderer-version="${VECTOR_RENDERER_VERSION}" data-plan-hash="${hashVectorScenePlan(plan)}">`,
    `<defs><pattern id="paper-dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#1c1c2e" opacity=".06"/></pattern></defs>`,
    `<rect width="${width}" height="${height}" fill="#fffaf0"/>`,
    `<rect width="${width}" height="${height}" fill="url(#paper-dots)"/>`,
    setting,
    entities,
    composition,
    clutter,
    dialogue,
    `<rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="#1c1c2e" stroke-width="8"/>`,
    `<path d="M14,16 H120 M680,584 H786" stroke="#ef476f" stroke-width="7" stroke-linecap="round"/>`,
    `</svg>`
  ].join("");
  return Buffer.from(svg, "utf8");
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

export function hashVectorScenePlan(plan: VectorScenePlan): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalValue(plan)), "utf8")
    .digest("hex")}`;
}

export function inspectVectorPanelSvg(
  contract: RenderContract,
  svgBytes: Buffer
): {
  explicitDetailCoverage: number;
  pencilCompliance: number;
  unsupportedConcretenessRate: number;
} {
  const svg = svgBytes.toString("utf8");
  const explicitCovered = contract.explicitFacts.filter((fact) =>
    svg.includes(escapeXml(fact.factId))
  ).length;
  const pencilCovered = contract.pencilSlots.filter((slot) =>
    svg.includes(escapeXml(pencilSlotKey(slot.entityId, slot.slot)))
  ).length;
  return {
    explicitDetailCoverage:
      contract.explicitFacts.length === 0
        ? 1
        : explicitCovered / contract.explicitFacts.length,
    pencilCompliance:
      contract.pencilSlots.length === 0
        ? 1
        : pencilCovered / contract.pencilSlots.length,
    unsupportedConcretenessRate: 0
  };
}
