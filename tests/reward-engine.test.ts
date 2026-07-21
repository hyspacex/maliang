import { describe, expect, it } from "vitest";
import { RewardEngine } from "@maliang/craft-cards";
import { BENCHMARK_FIXTURES } from "@maliang/test-fixtures";

const under = BENCHMARK_FIXTURES.find((fixture) => fixture.id === "under-01");
const detailed = BENCHMARK_FIXTURES.find((fixture) => fixture.id === "noun-adjective-01");
if (!under || !detailed) throw new Error("Required fixtures missing.");

describe("RewardEngine", () => {
  it("requires an earlier diagnostic and a child-authored resolving span", () => {
    const engine = new RewardEngine();
    const currentText = "Mara sees a enormous green creature 1.";
    const currentGraph = structuredClone(detailed.expectedGraph);
    currentGraph.sourceHash = detailed.expectedGraph.sourceHash;
    const awards = engine.evaluate({
      learnerProfileId: "profile",
      triggerRevisionId: "before",
      resolvingRevisionId: "after",
      previousSourceText: under.sourceText,
      currentSourceText: currentText,
      previousGraph: under.expectedGraph,
      currentGraph,
      previousDiagnostics: ["MISSING_APPEARANCE_DETAIL"],
      alreadyEarned: new Set(),
      safetyBlocked: false,
      now: new Date("2026-07-16T00:00:00Z")
    });
    expect(awards.map((award) => award.cardId)).toEqual(["size"]);
    expect(awards[0]?.state).toBe("PENDING");
  });

  it("does not award a card without the earlier diagnostic", () => {
    const awards = new RewardEngine().evaluate({
      learnerProfileId: "profile",
      triggerRevisionId: "before",
      resolvingRevisionId: "after",
      previousSourceText: under.sourceText,
      currentSourceText: detailed.sourceText,
      previousGraph: under.expectedGraph,
      currentGraph: detailed.expectedGraph,
      previousDiagnostics: [],
      alreadyEarned: new Set(),
      safetyBlocked: false
    });
    expect(awards).toEqual([]);
  });

  it("is idempotent for an already-earned local card", () => {
    const awards = new RewardEngine().evaluate({
      learnerProfileId: "profile",
      triggerRevisionId: "before",
      resolvingRevisionId: "after",
      previousSourceText: under.sourceText,
      currentSourceText: detailed.sourceText,
      previousGraph: under.expectedGraph,
      currentGraph: detailed.expectedGraph,
      previousDiagnostics: ["MISSING_APPEARANCE_DETAIL"],
      alreadyEarned: new Set(["size"]),
      safetyBlocked: false
    });
    expect(awards).toEqual([]);
  });
});
