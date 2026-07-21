# Maliang demo — voiceover script (silent cut, 2:38)

The demo video is silent by design: record the voiceover below over it.
Each section header gives the on-screen segment and its time range. The
lines are paced for a comfortable read (~2.3 words per second) — if you
finish a beat early, just breathe; the next segment holds.

Every panel image in the video is a real render from Maliang's pipeline
settings (`gpt-image-2`, low quality, 960×720, the product's exact prompt
contract), with generation waits cut per production policy: never show
image generation in real time.

## Reproducible judge path

```bash
npm install
npm test          # 70 tests, 15 files
npm run dev       # browser surface at http://127.0.0.1:5173, fake provider
```

Full desktop experience (live rendering, persistence, PDF export):

```bash
npm run build
npm run start     # requires Codex CLI signed in + OPENAI_API_KEY in .env
```

The Moon Door story renders shown in the video are in
`output/playwright/moon-door/`.

---

## 0:00–0:10 — Title card

> Ma Liang is the boy from an ancient Chinese story. His magic pen brings
> whatever he draws to life.

## 0:10–0:18 — Empty six-panel editor

> With Codex and GPT-5.6, that fable is suddenly real — and the only limit
> left is imagination itself.

## 0:18–0:30 — "Mara waits." → all-pencil sketch

> You write: "Mara waits." Maliang draws exactly that — and nothing more.
> Everything your words don't say stays honest, provisional pencil.

## 0:30–0:44 — Revision: the cave and lantern appear, Mara stays blank

> You revise: "Mara waits in the dark cave, holding her little lantern."
> The cave appears. The lantern appears. But Mara is still a blank outline —
> because you never said what she looks like.

## 0:44–0:56 — "A small girl with a messy ponytail" → Mara becomes real

> One more revision — "a small girl with a messy ponytail" — and Mara
> becomes real. Every detail on the page is earned by the exact words you
> wrote.

## 0:56–1:12 — The writing helper: one question, your consent

> When a picture comes out pencil-heavy, Maliang can ask one reviewed
> question — with your consent. It never inserts words, never offers
> replacements, never scores, and never blocks finishing. It's built strictly
> enough for young writers, which means every writer stays the only author.

## 1:12–1:24 — Craft cards deck

> Revision earns craft cards — real author tricks like "show, don't tell"
> and "strong verbs" — unlocked only by evidence that your own rewrite
> fixed the picture.

## 1:24–1:36 — The full story written in the editor

> So you keep writing. Six panels, one story — The Moon Door — every
> sentence in your own voice, every panel earned.

## 1:36–1:52 — Pan down the finished comic page

> And this is what revision buys you: a finished comic where every single
> detail — the moon door, the lantern, the ponytail, the night sky — exists
> because you chose the words for it. That's writing training imagination.

## 1:52–2:14 — Built with Codex, running on GPT-5.6

> GPT-5.6 isn't just how we built Maliang — it's the engine inside it.
> Safety, scene extraction with source-span evidence, and render inspection
> run GPT-5.6 Terra through sandboxed, ephemeral Codex subprocesses, while
> GPT-5.6 Sol orchestrates image generation against a deterministic render
> contract. We built the core in Codex CLI, steered long runs from Codex
> Mobile while commuting, and used Sol's ultra mode with subagents to review
> every major design.

## 2:14–2:26 — Renderer benchmark board

> Codex also ran our renderer bake-off — raster image model, constrained
> vector plans, and the direct Images API, benchmarked head to head. The
> data picked the shipped default.

## 2:26–2:38 — Closing card

> Writing trains imagination — at seven, and at seventy. Maliang begins with
> kids, but the invitation is for everyone: your words are the magic pen.
