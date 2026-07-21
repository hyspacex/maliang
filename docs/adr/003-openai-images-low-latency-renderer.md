# ADR 003: benchmark a low-latency OpenAI Images renderer

Status: accepted as the default renderer for the Build Week demo build. The
original raster and constrained vector paths remain selectable alternatives.

## Context

The Codex image-tool path creates attractive panels but adds subprocess and
tool-orchestration latency. The constrained vector path removes the image model
but currently gives up substantial atmospheric and illustrative detail. A
direct Images API path can test whether a deliberately inexpensive draft
setting offers a useful middle ground.

## Decision

The default `openai-api` mode keeps the existing Codex safety, extraction, and
complaint-diagnosis boundary, but replaces only `generatePanel` and `editPanel`
with direct OpenAI Image API requests. `MALIANG_RENDERER=raster` and
`MALIANG_RENDERER=vector` retain the benchmarked alternatives.

The experiment uses:

- model `gpt-image-2`;
- quality `low`;
- size `960x720`, the minimum valid 4:3 resolution under the model's current
  655,360-pixel floor;
- JPEG output at compression setting 72; and
- one image per request.

Validated render contracts are converted to an instruction-separated scene
payload. Readable text is prohibited in model output and exact dialogue
continues to be composed locally. Local edits use the Images edits endpoint
with the prior raw panel as the first reference. Existing semantic cache keys
remain provider-specific through a distinct model-policy version.

`OPENAI_API_KEY` is loaded from the ignored `.env` file only by the Electron
main process or an explicitly opted-in benchmark process. It is sent only in
the HTTPS authorization header and is not forwarded to the sandboxed renderer,
written to jobs, included in prompts, placed on command lines, or recorded in
reports.

## Consequences

This path adds metered API usage and requires an API key in addition to the
adult's ChatGPT-backed Codex session used by the current text stages. It should
be judged on the same prompt and complete edit-to-panel wall time as the other
renderers. One synthetic specimen is evidence for a product decision, not a
latency distribution. It is the demo default because its visual-quality gain
outweighed the small measured end-to-end disadvantage versus vector; broader
runs and stricter provisional-detail enforcement remain production gates.
