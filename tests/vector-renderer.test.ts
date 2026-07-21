import { describe, expect, it } from "vitest";
import type { SceneGraph } from "@maliang/domain";
import { RenderCompiler } from "@maliang/render-compiler";
import { hashSource } from "@maliang/scene-validator";
import {
  defaultVectorScenePlan,
  inspectVectorPanelSvg,
  renderVectorPanelSvg,
  validateVectorScenePlan,
  vectorPlannableEntityIds
} from "@maliang/vector-renderer";

function graphFor(sourceText: string): SceneGraph {
  const maraStart = sourceText.indexOf("Mara");
  const greenStart = sourceText.indexOf("green");
  const enormousStart = sourceText.indexOf("enormous");
  const caveStart = sourceText.indexOf("cave");
  const lanternStart = sourceText.indexOf("lantern");
  return {
    schemaVersion: 1,
    sourceHash: hashSource(sourceText),
    entities: [{
      entityId: "character:mara",
      kind: "character",
      label: {
        value: "Mara",
        evidence: { start: maraStart, end: maraStart + 4, text: "Mara" }
      },
      attributes: [
        {
          slot: "relative_size",
          value: "enormous",
          scope: "identity_from_here",
          evidence: {
            start: enormousStart,
            end: enormousStart + 8,
            text: "enormous"
          }
        },
        {
          slot: "color",
          value: "green",
          scope: "identity_from_here",
          evidence: { start: greenStart, end: greenStart + 5, text: "green" }
        }
      ]
    }],
    actions: [],
    setting: {
      place: caveStart < 0
        ? null
        : {
            value: "cave",
            evidence: { start: caveStart, end: caveStart + 4, text: "cave" }
          },
      time: null,
      weather: null,
      lighting: null,
      objects: lanternStart < 0
        ? []
        : [{
            value: "lantern",
            evidence: {
              start: lanternStart,
              end: lanternStart + 7,
              text: "lantern"
            }
          }]
    },
    internalStates: [],
    dialogue: [],
    sequenceMarkers: [],
    diagnostics: []
  };
}

function contractFor(sourceText: string) {
  return new RenderCompiler().compile(graphFor(sourceText), {
    styleVersion: "comic-pencil-ink/v1",
    modelPolicyVersion: "vector-test/v1"
  });
}

describe("vector renderer", () => {
  it("renders a deterministic safe SVG with complete fact and pencil coverage", () => {
    const contract = contractFor("Mara is enormous and green in the cave by a lantern.");
    const plan = defaultVectorScenePlan(contract);
    const first = renderVectorPanelSvg({ contract, plan });
    const second = renderVectorPanelSvg({ contract, plan });
    const svg = first.toString("utf8");

    expect(second.equals(first)).toBe(true);
    expect(svg).toContain('data-renderer="vector"');
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("foreignObject");
    expect(svg).not.toMatch(/\b(?:href|src)=["']https?:/u);
    expect(inspectVectorPanelSvg(contract, first)).toEqual({
      explicitDetailCoverage: 1,
      pencilCompliance: 1,
      unsupportedConcretenessRate: 0
    });
  });

  it("rejects invented entities and unsupported action poses", () => {
    const contract = contractFor("Mara is enormous and green.");
    const plan = defaultVectorScenePlan(contract);
    const invalid = {
      ...plan,
      placements: [{
        entityId: "character:invented",
        x: 0.5,
        y: 0.75,
        scale: 1,
        facing: "right",
        pose: "running",
        sourceFactIds: [contract.explicitFacts[0]?.factId ?? "missing"]
      }]
    };
    const result = validateVectorScenePlan(contract, invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.join(" ")).toMatch(/Unknown entity|lacks an action/u);
  });

  it("treats duplicate place and object entities as setting art, not characters", () => {
    const source = "Mara waits in the cave by a lantern.";
    const value = graphFor(source);
    const caveStart = source.indexOf("cave");
    const lanternStart = source.indexOf("lantern");
    value.entities.push(
      {
        entityId: "place:cave",
        kind: "place",
        label: {
          value: "cave",
          evidence: { start: caveStart, end: caveStart + 4, text: "cave" }
        },
        attributes: []
      },
      {
        entityId: "object:lantern",
        kind: "object",
        label: {
          value: "lantern",
          evidence: {
            start: lanternStart,
            end: lanternStart + 7,
            text: "lantern"
          }
        },
        attributes: []
      }
    );
    const contract = new RenderCompiler().compile(value, {
      styleVersion: "comic-pencil-ink/v1",
      modelPolicyVersion: "vector-test/v1"
    });
    expect(vectorPlannableEntityIds(contract)).toEqual(["character:mara"]);
    const svg = renderVectorPanelSvg({
      contract,
      plan: defaultVectorScenePlan(contract)
    });
    expect(svg.toString("utf8").match(/data-entity-id=/gu)).toHaveLength(1);
    expect(inspectVectorPanelSvg(contract, svg).explicitDetailCoverage).toBe(1);
    expect(inspectVectorPanelSvg(contract, svg).pencilCompliance).toBe(1);
  });

  it("uses a non-humanoid rig for animal entities", () => {
    const value = graphFor("Mara is enormous and green.");
    const entity = value.entities[0];
    if (!entity) throw new Error("Expected fixture entity.");
    entity.entityId = "animal:mara";
    entity.kind = "animal";
    const contract = new RenderCompiler().compile(value, {
      styleVersion: "comic-pencil-ink/v1",
      modelPolicyVersion: "vector-test/v1"
    });
    const svg = renderVectorPanelSvg({
      contract,
      plan: defaultVectorScenePlan(contract)
    }).toString("utf8");
    expect(svg).toContain('data-entity-id="animal:mara"');
    expect(svg).toContain('rx="58" ry="38"');
    expect(svg).not.toContain("M-34,-78 Q-58,-38");
  });
});
