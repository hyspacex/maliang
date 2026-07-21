import type { CSSProperties } from "react";

export const BRAND = {
  productName: "MALIANG",
  mascotDisplayName: "Mali"
} as const;

export const color = {
  ink: "#1c1c2e",
  paper: "#f6f1e3",
  paperPanel: "#fffdf5",
  comicPaper: "#fbfaf4",
  paperDot: "#e6dcc4",
  pencil: "#a9aebd",
  mutedText: "#8a8a99",
  rewardYellow: "#ffd23f",
  actionBlue: "#4fc3f7",
  coral: "#e05252",
  coachSurface: "#eef7ff",
  childSurface: "#ffecec",
  lockedCard: "#d8d4c6",
  success: "#2e7d32",
  inProgress: "#e6960f",
  rendering: "#9068c9"
} as const;

export const typography = {
  display: "'Bangers', 'Arial Black', sans-serif",
  hand: "'Patrick Hand', 'Comic Sans MS', cursive"
} as const;

export const designTokens = {
  color,
  typography,
  radius: {
    storyCard: 12,
    dialog: 16,
    comicFrame: 4
  },
  border: {
    primary: 3,
    heavy: 4
  },
  layout: {
    mastheadHeight: 66,
    storyColumnWidth: 410,
    comicMaxWidth: 860,
    comicGap: 14
  }
} as const;

export function hardShadow(offset = 4, opacity = 1): CSSProperties["boxShadow"] {
  return `${offset}px ${offset}px 0 rgba(28, 28, 46, ${opacity})`;
}
