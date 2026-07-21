import type { CraftCardId } from "@maliang/domain";

export const CRAFT_CARD_CATALOG_VERSION = "1.0.0";

export interface CraftCardDefinition {
  cardId: CraftCardId;
  catalogVersion: string;
  title: string;
  body: string;
  color: string;
  skillCode: string;
  unlockRuleId: string;
  ordinal: number;
}

export const CRAFT_CARD_CATALOG: readonly CraftCardDefinition[] = [
  {
    cardId: "show",
    catalogVersion: CRAFT_CARD_CATALOG_VERSION,
    title: "SHOW, DON'T TELL",
    body: "Pictures can't see feelings. Show what a feeling looks like with an action, pose, or expression.",
    color: "#ff8a80",
    skillCode: "externalize-feeling",
    unlockRuleId: "show/v1",
    ordinal: 1
  },
  {
    cardId: "verbs",
    catalogVersion: CRAFT_CARD_CATALOG_VERSION,
    title: "STRONG VERBS",
    body: "Crept, stomped, and zoomed make three different pictures. Pick an action readers can see.",
    color: "#9575cd",
    skillCode: "visible-action",
    unlockRuleId: "verbs/v1",
    ordinal: 2
  },
  {
    cardId: "size",
    catalogVersion: CRAFT_CARD_CATALOG_VERSION,
    title: "SIZE & LOOK WORDS",
    body: "One look-word can change the whole picture. Add size, color, texture, shape, or clothing.",
    color: "#ffd23f",
    skillCode: "appearance-detail",
    unlockRuleId: "size/v1",
    ordinal: 3
  },
  {
    cardId: "quotes",
    catalogVersion: CRAFT_CARD_CATALOG_VERSION,
    title: "TALK IN QUOTES",
    body: "Put the exact spoken words inside quotation marks and they become a speech bubble.",
    color: "#4fc3f7",
    skillCode: "quoted-dialogue",
    unlockRuleId: "quotes/v1",
    ordinal: 4
  },
  {
    cardId: "place",
    catalogVersion: CRAFT_CARD_CATALOG_VERSION,
    title: "PAINT THE PLACE",
    body: "The background stays pencil until your words name a place, time, weather, or background object.",
    color: "#81c784",
    skillCode: "setting-detail",
    unlockRuleId: "place/v1",
    ordinal: 5
  },
  {
    cardId: "pick3",
    catalogVersion: CRAFT_CARD_CATALOG_VERSION,
    title: "PICK THE BEST 3",
    body: "Pros do not use every describing word. Keep the details that matter most.",
    color: "#ff8a65",
    skillCode: "detail-selection",
    unlockRuleId: "pick3/v1",
    ordinal: 6
  }
] as const;
