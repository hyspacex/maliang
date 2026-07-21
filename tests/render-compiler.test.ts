import { describe, expect, it } from "vitest";
import type { SceneGraph } from "@maliang/domain";
import {
  RenderCompiler,
  canonicalizeRenderContract,
  chooseRenderPlan,
  hashRenderContract,
  hashVisualRenderContract
} from "@maliang/render-compiler";
import { hashSource } from "@maliang/scene-validator";

function graph(text = "Mara waits."): SceneGraph {
  return {
    schemaVersion: 1,
    sourceHash: hashSource(text),
    entities: [{
      entityId: "character:mara",
      kind: "character",
      label: {
        value: "Mara",
        evidence: { start: 0, end: 4, text: "Mara" }
      },
      attributes: []
    }],
    actions: [],
    setting: {
      place: null,
      time: null,
      weather: null,
      lighting: null,
      objects: []
    },
    internalStates: [],
    dialogue: [],
    sequenceMarkers: [],
    diagnostics: []
  };
}

const options = {
  styleVersion: "test-style",
  modelPolicyVersion: "test-model"
} as const;

describe("RenderCompiler", () => {
  it("turns missing identity and setting slots into deterministic pencil/blank slots", () => {
    const contract = new RenderCompiler().compile(graph(), options);
    expect(contract.pencilSlots).toEqual([
      {
        entityId: null,
        slot: "setting",
        treatment: "blank_paper",
        reason: "setting_unspecified"
      },
      {
        entityId: "character:mara",
        slot: "color",
        treatment: "gray_pencil",
        reason: "present_but_unspecified"
      },
      {
        entityId: "character:mara",
        slot: "relative_size",
        treatment: "gray_pencil",
        reason: "present_but_unspecified"
      },
      {
        entityId: "character:mara",
        slot: "texture",
        treatment: "gray_pencil",
        reason: "present_but_unspecified"
      }
    ]);
  });

  it("never compiles internal state into a visible fact", () => {
    const source = "Mara was scared.";
    const value = graph(source);
    const start = source.indexOf("scared");
    value.internalStates.push({
      entityId: "character:mara",
      state: "scared",
      evidence: { start, end: start + 6, text: "scared" }
    });
    const contract = new RenderCompiler().compile(value, options);
    expect(contract.explicitFacts.map((fact) => fact.slot)).not.toContain("facial_expression");
    expect(contract.explicitFacts.map((fact) => fact.slot)).not.toContain("pose");
  });

  it("canonicalizes and hashes equivalent object key ordering identically", () => {
    const contract = new RenderCompiler().compile(graph(), options);
    const reordered = {
      ...contract,
      characterReferenceVersions: { b: "2", a: "1" }
    };
    const reorderedAgain = {
      ...contract,
      characterReferenceVersions: { a: "1", b: "2" }
    };
    expect(canonicalizeRenderContract(reordered)).toBe(canonicalizeRenderContract(reorderedAgain));
    expect(hashRenderContract(reordered)).toBe(hashRenderContract(reorderedAgain));
  });

  it("selects dialogue-only composition without an image call", () => {
    const previous = new RenderCompiler().compile(graph(), options);
    const current = structuredClone(previous);
    current.dialogueOverlay.push({
      speakerId: "character:mara",
      exactText: "Hello!",
      source: { start: 0, end: 6, text: "Hello!" }
    });
    expect(chooseRenderPlan(previous, current)).toBe("DIALOGUE_ONLY");
  });

  it("reuses a raw image across source and evidence-only edits", () => {
    const previous = new RenderCompiler().compile(graph("Mara waits."), options);
    const current = structuredClone(previous);
    current.sourceHash = hashSource("Mara waits!");
    const firstFact = current.explicitFacts[0];
    if (!firstFact) throw new Error("Expected a visual fact.");
    firstFact.factId = "renumbered:fact";
    firstFact.evidence = { start: 1, end: 5, text: "Mara" };

    expect(hashVisualRenderContract(current)).toBe(
      hashVisualRenderContract(previous)
    );
    expect(chooseRenderPlan(previous, current)).toBe("NO_VISUAL_CHANGE");
  });

  it("invalidates the visual hash when a visible fact changes", () => {
    const previous = new RenderCompiler().compile(graph(), options);
    const current = structuredClone(previous);
    const firstFact = current.explicitFacts[0];
    if (!firstFact) throw new Error("Expected a visual fact.");
    firstFact.value = "character:Mara wearing red";

    expect(hashVisualRenderContract(current)).not.toBe(
      hashVisualRenderContract(previous)
    );
  });
});
