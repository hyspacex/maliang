import { randomUUID } from "node:crypto";
import type {
  CraftCardAward,
  CraftCardId,
  DiagnosticCode,
  EvidenceRange,
  SceneGraph
} from "@maliang/domain";
import { calculateClutterPressure, isGenericAction } from "@maliang/render-compiler";
import {
  CRAFT_CARD_CATALOG,
  CRAFT_CARD_CATALOG_VERSION,
  type CraftCardDefinition
} from "./catalog";

export {
  CRAFT_CARD_CATALOG,
  CRAFT_CARD_CATALOG_VERSION,
  type CraftCardDefinition
} from "./catalog";

export interface RewardEvaluation {
  learnerProfileId: string;
  triggerRevisionId: string;
  resolvingRevisionId: string;
  previousSourceText: string;
  currentSourceText: string;
  previousGraph: SceneGraph;
  currentGraph: SceneGraph;
  previousDiagnostics: readonly DiagnosticCode[];
  alreadyEarned: ReadonlySet<CraftCardId>;
  safetyBlocked: boolean;
  now?: Date;
}

function changedRange(before: string, after: string): EvidenceRange | null {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (
    beforeEnd > start &&
    afterEnd > start &&
    before[beforeEnd - 1] === after[afterEnd - 1]
  ) {
    beforeEnd--;
    afterEnd--;
  }
  if (start === afterEnd && start === beforeEnd) return null;
  return { start, end: afterEnd, text: after.slice(start, afterEnd) };
}

function evidenceTouchesChange(evidence: EvidenceRange, change: EvidenceRange): boolean {
  if (change.start === change.end) return evidence.start <= change.start && evidence.end >= change.end;
  return evidence.end > change.start && evidence.start < change.end;
}

function visibleStateEvidence(graph: SceneGraph): EvidenceRange[] {
  return graph.entities.flatMap((entity) =>
    entity.attributes
      .filter((attribute) =>
        ["pose", "facial_expression", "gaze", "movement"].includes(attribute.slot)
      )
      .map((attribute) => attribute.evidence)
  ).concat(graph.actions.map((action) => action.evidence));
}

function appearanceEvidence(graph: SceneGraph): EvidenceRange[] {
  return graph.entities.flatMap((entity) =>
    entity.attributes
      .filter((attribute) =>
        [
          "relative_size",
          "color",
          "material",
          "texture",
          "body_feature",
          "clothing",
          "identity_object",
          "shape"
        ].includes(attribute.slot)
      )
      .map((attribute) => attribute.evidence)
  );
}

function settingEvidence(graph: SceneGraph): EvidenceRange[] {
  return [
    graph.setting.place?.evidence,
    graph.setting.time?.evidence,
    graph.setting.weather?.evidence,
    graph.setting.lighting?.evidence,
    ...graph.setting.objects.map((object) => object.evidence)
  ].filter((value): value is EvidenceRange => Boolean(value));
}

function cardResolutionEvidence(cardId: CraftCardId, graph: SceneGraph): EvidenceRange[] {
  switch (cardId) {
    case "show":
      return visibleStateEvidence(graph);
    case "verbs":
      return graph.actions
        .filter((action) => !isGenericAction(action.verb))
        .map((action) => action.evidence);
    case "size":
      return appearanceEvidence(graph);
    case "quotes":
      return graph.dialogue.map((dialogue) => dialogue.content);
    case "place":
      return settingEvidence(graph);
    case "pick3":
      return graph.entities.flatMap((entity) => [
        entity.label.evidence,
        ...entity.attributes.map((attribute) => attribute.evidence)
      ]).concat(graph.actions.map((action) => action.evidence));
  }
}

const DIAGNOSTIC_FOR_CARD: Readonly<Record<CraftCardId, DiagnosticCode>> = {
  show: "INTERNAL_STATE_NOT_VISIBLE",
  verbs: "GENERIC_OR_MISSING_ACTION",
  size: "MISSING_APPEARANCE_DETAIL",
  quotes: "UNQUOTED_DIALOGUE",
  place: "SETTING_UNDERSPECIFIED",
  pick3: "CLUTTER_PRESSURE"
};

export class RewardEngine {
  evaluate(input: RewardEvaluation): CraftCardAward[] {
    if (input.safetyBlocked) return [];
    const change = changedRange(input.previousSourceText, input.currentSourceText);
    if (!change) return [];
    const timestamp = (input.now ?? new Date()).toISOString();
    const awards: CraftCardAward[] = [];

    for (const definition of CRAFT_CARD_CATALOG) {
      const cardId = definition.cardId;
      if (input.alreadyEarned.has(cardId)) continue;
      if (!input.previousDiagnostics.includes(DIAGNOSTIC_FOR_CARD[cardId])) continue;
      if (
        cardId === "pick3" &&
        calculateClutterPressure(input.currentGraph).active
      ) continue;
      const evidence = cardResolutionEvidence(cardId, input.currentGraph).filter(
        (item) => evidenceTouchesChange(item, change)
      );
      if (evidence.length === 0 && cardId !== "pick3") continue;
      if (cardId === "pick3" && input.currentSourceText.length >= input.previousSourceText.length) {
        continue;
      }
      awards.push({
        id: randomUUID(),
        learnerProfileId: input.learnerProfileId,
        cardId,
        triggerRevisionId: input.triggerRevisionId,
        resolvingRevisionId: input.resolvingRevisionId,
        changedEvidence: evidence.length > 0 ? evidence : [change],
        state: "PENDING",
        earnedAt: timestamp,
        acknowledgedAt: null
      });
    }

    return awards.sort((a, b) => {
      const aOrdinal = CRAFT_CARD_CATALOG.find((card) => card.cardId === a.cardId)?.ordinal ?? 0;
      const bOrdinal = CRAFT_CARD_CATALOG.find((card) => card.cardId === b.cardId)?.ordinal ?? 0;
      return aOrdinal - bOrdinal;
    });
  }
}
