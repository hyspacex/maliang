# Maliang three-minute demo

This script is both the demo-video narration and a reproducible judge path.
The browser surface uses the deterministic fake provider: local, zero model
spend, no credentials needed.

## Prepare

```bash
npm install
npm test          # 70 tests, 15 files
npm run dev       # browser surface at http://127.0.0.1:5173, fake provider
```

For the full desktop experience (live rendering, persistence, PDF export):

```bash
npm run build
npm run start     # requires Codex CLI signed in + OPENAI_API_KEY in .env
```

Production note: never show image generation in real time. Jump-cut from the
committed sentence directly to the finished redraw (the fake provider is
instant; for live-render footage, cut the wait and keep the reveal).

## 0:00–0:20 — The problem

Narration:

> Ma Liang is the boy from the Chinese legend whose paintings came true.
> AI image tools give every kid that magic brush — but they teach the wrong
> lesson: mumble anything, get a masterpiece. Maliang flips it. Here, the
> picture only changes when your words change.

Show: title card, then the Maliang story editor with an empty six-panel page.

## 0:20–1:05 — Words become pictures, honestly

Narration:

> A child writes: "Mara waits." Maliang draws exactly that — and nothing
> more. Everything the words don't say stays honest pencil. It's provisional.
> Now the child revises: "Mara waits in the cave by a lantern." The cave and
> the lantern appear, because now the words earned them. Every detail in the
> frame is bound to the exact words that put it there. Nothing is invented.

Show: type "Mara waits." into panel 1 → provisional pencil sketch. Revise the
sentence → richer drawing. Hover/emphasize the evidence binding.

## 1:05–1:40 — The writing helper coaches, never writes

Narration:

> When a picture comes out pencil-heavy, Maliang can ask — with the child's
> consent — one reviewed question, like "What do you notice about how it
> looks?" It never inserts words, never offers replacements, never scores,
> never blocks finishing. The child revises in their own voice, Maliang
> redraws, and a resolved diagnostic earns a craft card.

Show: the "ONE QUESTION — YOUR IDEAS" helper panel; the KEEP MY WORDS /
ANOTHER PART choices; the craft-card counter.

## 1:40–2:25 — Built with Codex and GPT-5.6, running on Codex and GPT-5.6

Narration:

> GPT-5.6 isn't just how we built Maliang — it's the engine inside it.
> Every structured job — safety, scene extraction with source-span evidence,
> render inspection — runs GPT-5.6 Terra through sandboxed, ephemeral Codex
> subprocesses with schema-validated output. GPT-5.6 Sol orchestrates image
> generation against a deterministic render contract.
> We built the product in Codex CLI, steered long test runs from Codex Mobile
> while commuting, and used Sol's ultra mode with subagents to review every
> major design idea before writing it. Codex also ran our renderer bake-off:
> raster image model, constrained vector plans, and the direct Images API —
> benchmarked head to head. The data picked the default renderer.

Show: `codex exec --model gpt-5.6-terra --output-schema ...` invocation from
the technical doc; the three-renderer benchmark board
(`output/playwright/comparison/raster-vs-vector-vs-openai-api.png`); the test
run summary (70 passed).

## 2:25–2:50 — Why it matters

Narration:

> Revision is the highest-leverage skill in learning to write, and the one
> kids resist most. Maliang makes revision the reward: better words, better
> picture, visible proof of craft. Local-first, encrypted, and the child is
> the only author on the page. Maliang — the magic brush that makes you
> the magician.

Show: finished multi-panel comic page, craft cards earned, title card with
repo URL.
