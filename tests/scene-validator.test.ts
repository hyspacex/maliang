import { describe, expect, it } from "vitest";
import type { SceneGraph } from "@maliang/domain";
import {
  hashSource,
  meaningfulSceneEvidence,
  SceneValidator,
  unmappedSceneEvidence
} from "@maliang/scene-validator";

function baseGraph(text: string): SceneGraph {
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

describe("SceneValidator", () => {
  it("discards an invented attribute whose evidence is not exact", () => {
    const text = "Mara saw a dragon.";
    const graph = baseGraph(text);
    graph.entities[0]?.attributes.push({
      slot: "color",
      value: "green",
      scope: "identity_from_here",
      evidence: { start: 11, end: 17, text: "green" }
    });
    const result = new SceneValidator().validate(text, graph);
    expect(result.valid).toBe(true);
    expect(result.graph?.entities[0]?.attributes).toEqual([]);
    expect(result.issues[0]?.code).toBe("EVIDENCE_TEXT_MISMATCH");
  });

  it("rejects a scene graph from an older source revision", () => {
    const graph = baseGraph("Mara waits.");
    const result = new SceneValidator().validate("Mara runs.", graph);
    expect(result.valid).toBe(false);
    expect(result.graph).toBeNull();
    expect(result.issues[0]?.code).toBe("SOURCE_HASH_MISMATCH");
  });

  it("rejects evidence that splits a Unicode surrogate pair", () => {
    const text = "Mara 😀 waits.";
    const graph = baseGraph(text);
    graph.sequenceMarkers.push({
      value: "broken",
      evidence: { start: 6, end: 7, text: "\ude00" }
    });
    const result = new SceneValidator().validate(text, graph);
    expect(result.graph?.sequenceMarkers).toEqual([]);
    expect(result.issues[0]?.code).toBe("UNICODE_BOUNDARY_INVALID");
  });

  it("accepts exact curly-quoted dialogue and punctuation", () => {
    const text = "Mara said, “Wait—what?!”";
    const graph = baseGraph(text);
    const content = "Wait—what?!";
    const start = text.indexOf(content);
    graph.dialogue.push({
      speakerId: "character:mara",
      content: { start, end: start + content.length, text: content },
      quoteStart: text.indexOf("“"),
      quoteEnd: text.length
    });
    const result = new SceneValidator().validate(text, graph);
    expect(result.valid).toBe(true);
    expect(result.graph?.dialogue[0]?.content.text).toBe(content);
  });

  it("removes a facial expression inferred only from a feeling word", () => {
    const text = "Mara was scared.";
    const graph = baseGraph(text);
    const start = text.indexOf("scared");
    graph.internalStates.push({
      entityId: "character:mara",
      state: "scared",
      evidence: { start, end: start + 6, text: "scared" }
    });
    graph.entities[0]?.attributes.push({
      slot: "facial_expression",
      value: "fearful",
      scope: "panel_state",
      evidence: { start, end: start + 6, text: "scared" }
    });
    const result = new SceneValidator().validate(text, graph);
    expect(result.graph?.internalStates).toHaveLength(1);
    expect(result.graph?.entities[0]?.attributes).toHaveLength(0);
    expect(result.issues.some((issue) => issue.code === "FEELING_INFERRED_VISUALLY")).toBe(true);
  });

  it("removes actions with unknown entity references", () => {
    const text = "Mara crept.";
    const graph = baseGraph(text);
    const start = text.indexOf("crept");
    graph.actions.push({
      agentId: "character:unknown",
      verb: "crept",
      evidence: { start, end: start + 5, text: "crept" }
    });
    const result = new SceneValidator().validate(text, graph);
    expect(result.graph?.actions).toEqual([]);
    expect(result.issues[0]?.code).toBe("ENTITY_REFERENCE_INVALID");
  });

  it("reports meaningful source spans omitted from every typed scene fact", () => {
    const text = "A girl with red hair swims in a blue pool.";
    const graph = baseGraph(text);
    graph.entities[0] = {
      entityId: "character:girl",
      kind: "character",
      label: {
        value: "girl",
        evidence: { start: 2, end: 6, text: "girl" }
      },
      attributes: [
        {
          slot: "color",
          value: "red",
          scope: "identity_from_here",
          evidence: { start: 12, end: 15, text: "red" }
        },
        {
          slot: "body_feature",
          value: "hair",
          scope: "identity_from_here",
          evidence: { start: 16, end: 20, text: "hair" }
        }
      ]
    };

    expect(unmappedSceneEvidence(text, graph).map((item) => item.text)).toEqual([
      "swims",
      "in",
      "blue",
      "pool"
    ]);
  });

  it("can require every meaningful span when the first graph is structurally invalid", () => {
    const text = "A girl with red hair swims in a bright blue pool.";
    expect(meaningfulSceneEvidence(text).map((item) => item.text)).toEqual([
      "girl",
      "red",
      "hair",
      "swims",
      "in",
      "bright",
      "blue",
      "pool"
    ]);
  });

  it("accepts complete evidence coverage including action and place relationships", () => {
    const text = "A girl with red hair swims in a blue pool.";
    const graph = baseGraph(text);
    graph.entities[0] = {
      entityId: "character:girl",
      kind: "character",
      label: {
        value: "girl",
        evidence: { start: 2, end: 6, text: "girl" }
      },
      attributes: [{
        slot: "body_feature",
        value: "red hair",
        scope: "identity_from_here",
        evidence: { start: 7, end: 20, text: "with red hair" }
      }]
    };
    graph.actions.push({
      agentId: "character:girl",
      verb: "swims",
      evidence: { start: 21, end: 26, text: "swims" }
    });
    graph.setting.place = {
      value: "blue pool",
      evidence: { start: 27, end: 41, text: "in a blue pool" }
    };

    expect(unmappedSceneEvidence(text, graph)).toEqual([]);
  });
});
