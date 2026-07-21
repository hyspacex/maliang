import { describe, expect, it } from "vitest";
import {
  MALIANG_BRAND,
  RevisionGuard,
  transitionRenderJob
} from "@maliang/domain";

describe("revision ordering", () => {
  it("uses the direct OpenAI image API renderer by default", () => {
    expect(MALIANG_BRAND.defaultRenderer).toBe("openai-api");
    expect(MALIANG_BRAND.modelPolicyVersion).toBe(
      MALIANG_BRAND.openAIImageApiModelPolicyVersion
    );
  });

  it("never accepts an older result after a newer edit", () => {
    const guard = new RevisionGuard();
    const oldVersion = guard.commit("panel-1");
    const newVersion = guard.commit("panel-1");
    expect(guard.accepts({ panelId: "panel-1", revisionVersion: oldVersion })).toBe(false);
    expect(guard.accepts({ panelId: "panel-1", revisionVersion: newVersion })).toBe(true);
  });

  it("rejects illegal and terminal render-job transitions", () => {
    expect(transitionRenderJob("CREATED", "SAFETY_CHECKING")).toBe("SAFETY_CHECKING");
    expect(transitionRenderJob("CREATED", "COMPILED")).toBe("COMPILED");
    expect(() => transitionRenderJob("READY", "GENERATING")).toThrow(
      "Invalid render-job transition"
    );
    expect(() => transitionRenderJob("CREATED", "READY")).toThrow(
      "Invalid render-job transition"
    );
  });
});
