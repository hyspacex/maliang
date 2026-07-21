# ADR 002: use constrained vector plans for the live writing loop

Status: retained as an experimental alternative; the direct OpenAI Images API
renderer is now the product default.

## Context

Maliang's teaching loop requires an authoritative panel update within five
seconds. The original Codex image path can produce attractive graphite panels,
but cold generation is too slow for a tight word-to-picture feedback loop.
Image prompting also makes edit locality, literal gaps, and character
consistency provider-dependent.

## Decision

After scene extraction and deterministic render-contract compilation, a
structured text job returns a `VectorScenePlan`. The plan may control only:

- composition preset;
- placement of already-present entity IDs;
- normalized position and bounded scale;
- left or right facing;
- an allowlisted pose; and
- references to existing facts from the render contract.

The validator rejects unknown entities or facts, duplicate or missing
placements, out-of-bounds geometry, and action poses without an action fact.
The model never returns SVG or executable code.

A trusted local TypeScript renderer applies all colors, sizes, settings,
pencil slots, clutter, and exact dialogue from the evidence-bound render
contract. It emits self-contained SVG with no scripts, `foreignObject`,
external resources, or model-authored readable text.

Setting `MALIANG_RENDERER=vector` selects the experiment. With no setting, the
desktop application uses the direct OpenAI Images API and local SVG
dialogue-composition path. Switching modes does not change story text.

## Consequences

Vector output is deterministic, printable, inexpensive to regenerate, and
structurally inspectable for fact and pencil-slot coverage. Character identity
and unchanged layers can remain stable across edits.

The first art kit is deliberately small. It cannot yet match the expressive
surface detail of a high-quality generated illustration, and unfamiliar props
fall back to generic evidence-bound marks. Product should judge whether its
speed, causal clarity, and consistent handmade style outweigh that loss before
removing the raster option.
