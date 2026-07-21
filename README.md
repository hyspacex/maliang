# Maliang

Maliang is a local-first comic-making prototype where a child changes a picture
only by changing their own words. Every renderable detail is bound to an exact
source span, unspecified details remain provisional, and exact dialogue is
composed locally.

The name comes from the ancient Chinese story of Ma Liang (马良) and his magic
pen, which brings whatever he draws to life. GenAI has made that fable real —
a child's imagination is now the only limit — so Maliang is built to make kids
dream, express themselves, and practice the one skill that trains imagination
itself: writing. The child holds the magic pen; their words are the brush.

## OpenAI Build Week — judge quick start

Maliang was built with Codex and runs on GPT-5.6 at its core: `gpt-5.6-terra`
for structured safety/extraction/inspection jobs and `gpt-5.6-sol` for
image-generation orchestration, both invoked through sandboxed ephemeral
Codex CLI subprocesses. See `SUBMISSION.md` for the full Codex/GPT-5.6 usage
story and `DEMO.md` for a timestamped demo walkthrough.

Zero-cost judge path (no credentials, no model spend, any platform with
Node 22.5+):

```bash
npm install
npm test        # 70 tests across 15 files
npm run dev     # full UI at http://127.0.0.1:5173 with the deterministic fake provider
```

Full live path (macOS): sign in to Codex CLI, put `OPENAI_API_KEY` in an
ignored `.env`, then `npm run build && npm run start`.

## Development

Requirements:

- macOS
- Node.js 22.5 or newer
- Codex CLI in the reviewed `>=0.144.5 <0.146.0` range, signed in with ChatGPT
  for opt-in live exercises
- `OPENAI_API_KEY` in an ignored `.env` file for the default image renderer

```bash
npm install
npm test
npm run build
npm run dev
```

The browser development surface uses the deterministic fake provider. It never
spends model usage. The Electron app owns persistence, Codex subprocesses, PDF
export, and the sandboxed renderer bridge.

## Capability and benchmark

```bash
npm run check:codex
npm run benchmark
npm run benchmark:vector
```

Live Codex benchmark work is intentionally opt-in and uses synthetic fixtures:

```bash
MALIANG_LIVE_CODEX=1 npm run benchmark:live
MALIANG_LIVE_CODEX=1 npm run benchmark:vector:live
MALIANG_LIVE_CODEX=1 MALIANG_LIVE_OPENAI=1 npm run benchmark:openai:live
```

For a product-level edit-to-panel comparison that includes safety, extraction,
evidence repair, planning or image generation, persistence, and composition:

```bash
MALIANG_LIVE_CODEX=1 npm run benchmark:product -- \
  --renderer=vector --fixture=setting-01
```

The app never reads Codex credential files. It checks only `codex login status`
and invokes ChatGPT's reviewed bundled Codex executable on macOS (falling back
to `codex` on `PATH`) with an argument array and ephemeral sessions. Structured
text jobs explicitly use reviewed `gpt-5.6-terra`; image-tool orchestration uses
`gpt-5.6-sol`. Both ignore user configuration/rules and use per-job working
directories.

Structured provider jobs use a 120-second hard ceiling. The UI remains
responsive and revision-aware while those jobs run. Typing waits for a
1.2-second quiet window before committing; a newer revision terminates the
older local Codex subprocess and superseded results are never published.

Scene extraction returns compact entity references and source-span IDs. Maliang
deterministically hydrates hashes, stable IDs, offsets, and exact evidence text,
which removes error-prone bookkeeping from the model response. A validated
scene graph and render contract are saved before image generation, so Retry
resumes at the image stage instead of repeating safety and extraction.

Raw illustrations are encrypted and cached by a semantic visual hash that
ignores punctuation, evidence offsets, and locally composed dialogue. The cache
survives app restarts; a hit can recompose the panel without another image
generation or additional Codex usage. Reusing an exact previously validated
sentence also restores its saved graph and contract before any model call,
which makes undo/revisit deterministic.

## Writing helper

After a current panel finishes drawing, Maliang derives curriculum diagnostics
from the validated scene graph and render contract—not from whether an image
looks aesthetically good or bad. A pencil-heavy first attempt can open a
consent-first picture check:

1. the child decides whether the picture already matches their idea;
2. if not, they choose one neutral focus such as action, appearance, or setting;
3. Maliang asks one reviewed catalog question and returns focus to the unchanged
   story editor; and
4. after a child-authored revision, Maliang redraws and asks whether it is closer.

The helper never inserts text, offers replacement words, supplies story ideas,
scores writing, or blocks finishing. `KEEP IT`, `LATER`, and the collapsed
`CHECK THIS PICTURE` path keep coaching optional. Child-facing questions are
fixed application copy; model output is restricted to structured diagnostic
codes, and complaint results are rejected when they belong to an older panel
revision.

## Renderer modes

The constrained vector renderer is available as an experimental mode while
Product reviews the comparison. The text model returns a schema-validated
scene plan containing only entity placement, facing, scale, pose, and
source-fact references. It cannot return SVG, JavaScript, external URLs,
readable words, or new scene facts. Maliang's trusted local renderer turns the
plan and render contract into a deterministic SVG, then adds exact dialogue
locally.

The direct OpenAI Images API renderer is the default. Start the application or
select either retained alternative with:

```bash
npm run start
MALIANG_RENDERER=raster npm run start
MALIANG_RENDERER=vector npm run start
```

The default renderer reads `OPENAI_API_KEY` from the ignored `.env` file
only in the Electron main process. It calls `gpt-image-2` with low quality, a
minimum valid 4:3 `960x720` canvas, and compressed JPEG output. Set
`MALIANG_OPENAI_ENV_FILE` only when the ignored env file lives elsewhere.

All modes retain revision cancellation, strict evidence validation, local
encrypted persistence, and stale-result rejection. Vector mode does not call
an image model.
