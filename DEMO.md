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

## 0:00–0:30 — The magic pen is real now

Narration:

> Ma Liang is the boy from an ancient Chinese story. He has a magic pen:
> whatever he draws comes to life. For generations that was a fable. With
> Codex and GPT-5.6, it's literally true — AI can bring a child's
> imagination to life, and the only limit left is imagination itself. But
> image tools teach kids the wrong lesson: mumble anything, get a
> masterpiece. Maliang flips it. Here, the picture only changes when your
> words change — because writing is the skill that trains imagination.

Show: title card, then the empty six-panel story editor (0:30–0:39).

## 0:39–1:15 — Words become pictures, honestly

Narration:

> The child writes: "Mara waits." Maliang draws exactly that — and nothing
> more. Everything the words don't say stays honest, provisional pencil.
> The child revises: "Mara waits in the dark cave, holding her little
> lantern." The cave appears. The lantern appears. But Mara is still a blank
> outline — because the child never said what she looks like. One more
> revision — "a small girl with a messy ponytail" — and Mara becomes real.
> Every detail is bound to the exact words that earned it.

Show: the three revision beats in panel 1 — all-pencil placeholder, the
faceless cave render, then the fully drawn Mara.

## 1:15–1:33 — The writing helper coaches, never writes

Narration:

> When a picture comes out pencil-heavy, Maliang can ask — with the child's
> consent — one reviewed question. It never inserts words, never offers
> replacements, never scores, never blocks finishing. The child revises in
> their own voice, and resolved diagnostics earn craft cards.

Show: the "ONE QUESTION — YOUR IDEAS" helper panel with KEEP MY WORDS /
ANOTHER PART choices.

## 1:33–2:19 — Built with Codex and GPT-5.6, running on Codex and GPT-5.6

Narration:

> GPT-5.6 isn't just how we built Maliang — it's the engine inside it.
> Safety checks, scene extraction with source-span evidence, and render
> inspection all run GPT-5.6 Terra through sandboxed, ephemeral Codex
> subprocesses with schema-validated output, while GPT-5.6 Sol orchestrates
> image generation against a deterministic render contract. We built the
> core in Codex CLI, steered long runs from Codex Mobile while commuting,
> and used Sol's ultra mode with subagents to review every major design.
> Codex also ran our renderer bake-off: a raster image model, constrained
> vector plans, and the direct Images API — benchmarked head to head. The
> data picked the shipped default.

Show: the `codex exec` invocations for both models; the three-renderer
benchmark board (`output/playwright/comparison/raster-vs-vector-vs-openai-api.png`).

## 2:19–2:32 — Why it matters

Narration:

> Revision is the highest-leverage skill in learning to write — and the one
> kids resist most. Maliang makes revision the reward, and the child is the
> only author on the page. Maliang — the magic brush that makes you the
> magician.

Show: closing card with the finished render and repo URL.
