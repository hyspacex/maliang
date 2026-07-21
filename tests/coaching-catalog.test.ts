import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_CODES } from "@maliang/domain";
import {
  coachingMessage,
  COACHING_CATALOG,
  COACHING_CATALOG_VERSION
} from "@maliang/coaching-catalog";

describe("reviewed coaching catalog", () => {
  it("gives every diagnostic a short focus and an open, neutral question", () => {
    expect(COACHING_CATALOG_VERSION).toBe("1.1.0");
    expect(Object.keys(COACHING_CATALOG).sort()).toEqual([...DIAGNOSTIC_CODES].sort());

    for (const code of DIAGNOSTIC_CODES) {
      const template = COACHING_CATALOG[code];
      expect(template.code).toBe(code);
      expect(template.focusLabel).toBe(template.focusLabel.trim());
      expect(template.focusLabel.length).toBeGreaterThan(0);
      expect(template.focusLabel.length).toBeLessThanOrEqual(16);
      expect(template.question).toMatch(/\?$/);
      expect(template.question).not.toMatch(
        /\b(?:add|bad|better|example|points?|score|starter|try|use|weak|write)\b/i
      );
      expect(template.question).not.toMatch(/["“”]/);
    }
  });

  it("preserves the existing coachingMessage contract", () => {
    expect(coachingMessage("GENERIC_OR_MISSING_ACTION", "the dragon")).toBe(
      "What is the dragon doing that a picture could show?"
    );
    expect(coachingMessage("MISSING_APPEARANCE_DETAIL")).toBe(
      "What word would show what it looks like?"
    );
    expect(coachingMessage("RENDER_MISMATCH")).toBe(
      "Your words already say that. I'll try drawing the panel again."
    );
  });
});
