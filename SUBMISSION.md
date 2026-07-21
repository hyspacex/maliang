# OpenAI Build Week Submission — Maliang

- **Track:** Education
- **Repository:** https://github.com/hyspacex/maliang (public, MIT)
- **Codex `/feedback` Session ID:** `019f6ec7-3fc0-78b2-aa28-88e033d3e9d7`
- **Demo video:** https://youtu.be/fKPEeqB7PoQ
- **Platform:** macOS desktop (Electron). A zero-cost browser judge path is
  documented in the README and in `DEMO.md`.

---

## Tagline

Your words are the magic pen. Maliang turns writing revision — the part of
writing kids resist most — into the reward itself: better words, better
picture.

## Inspiration — why "Maliang"

Maliang (马良) is the boy from the ancient Chinese story *Ma Liang and the
Magic Brush*. He is given a magic pen: whatever he draws comes to life.

For generations that was a fable. With GenAI it is suddenly, literally true —
Codex and GPT-5.6 can bring a child's imagination to life on the page. The
only thing that limits a child now is the reach of their own imagination, so
the most important thing we can do is let them dream and let them express
themselves. And the skill that trains both — expression *and* imagination —
is writing. We named the project Maliang to tell every kid: **you already
hold the magic pen. Your words are the brush.**

But there's a trap in the magic. Every child who has used an AI image tool
has felt it — and learned exactly the wrong lesson: mumble anything, get a
beautiful picture. The craft disappears. Maliang inverts that. It is a
comic-making studio where the *only* way to change the picture is to change
your own words. Vague writing produces a provisional pencil sketch. Specific,
revised writing gets inked. Revision stops being homework and becomes the
game mechanic — the magic pen only answers to the words you actually wrote.

## What it does

- A child writes a comic panel in their own words. Maliang draws **exactly what
  the words say** — every renderable detail is bound to an exact source span in
  the child's sentence, and anything the child didn't specify stays visibly
  provisional (pencil).
- When a first attempt comes out pencil-heavy, a consent-first **writing
  helper** can open: the child decides whether the picture already matches
  their idea, picks one neutral focus (action, appearance, setting), gets **one
  reviewed catalog question**, and returns to their unchanged editor. After a
  child-authored revision, Maliang redraws and asks whether it is closer.
- The helper **never writes for the child**: it inserts no text, offers no
  replacement words, supplies no story ideas, and never blocks finishing.
  All child-facing coaching copy is fixed application copy; model output is
  restricted to structured diagnostic codes.
- Resolved diagnostics earn **craft cards** — a curriculum reward tied to
  evidence that the child's own revision fixed the issue.
- Everything is **local-first and private**: local encrypted persistence,
  encrypted illustration cache, exact dialogue composed locally, PDF export
  from the desktop app.

## How we built it — Codex and GPT-5.6 throughout

**GPT-5.6 is the runtime engine, not just the build tool.**

- **`gpt-5.6-terra`** runs every structured text job through a sandboxed,
  ephemeral `codex exec` subprocess with JSON-Schema-constrained output:
  safety classification, scene extraction with source-span evidence, render
  inspection against the contract, and complaint-transcript diagnosis. The
  gateway pins the reviewed Codex CLI version, passes argument arrays (never
  shell strings), uses per-job working directories, and never reads credential
  files.
- **`gpt-5.6-sol`** orchestrates image generation: it drives the image tool
  against a validated, deterministic render contract compiled from the scene
  graph, so the model illustrates only facts the child actually wrote.
- Scene extraction returns compact entity references; Maliang deterministically
  hydrates hashes, stable IDs, offsets, and exact evidence text — removing
  error-prone bookkeeping from the model and making validation strict.

**Codex built the product.**

- The core implementation was built in Codex CLI sessions; the `/feedback`
  session ID above covers the session where the majority of core functionality
  was written.
- **Codex Mobile as a remote mission control:** long test and benchmark runs
  executed on a laptop at home while progress was monitored — and redirected —
  from a phone during commutes. Build direction did not stop when the desk did.
- **GPT-5.6 Sol ultra mode with subagents** ran comprehensive design reviews of
  each major idea (evidence binding, the consent-first helper, the renderer
  strategy) before implementation, catching architectural problems while they
  were still cheap.
- **Benchmark-driven engineering:** Codex ran the product-level benchmark
  harness (`npm run benchmark:product`) across three renderer strategies —
  a raster image-model path, a constrained SVG vector-plan path, and the direct
  OpenAI Images API path — measuring end-to-end latency and output quality on
  synthetic fixtures. The data (raster ~160 s; vector ~58 s but visually
  simple; direct API ~61 s with the strongest child-character appeal) drove the
  shipped default, and the losing paths remain as selectable, tested modes.

## Challenges

- **Latency vs. authority.** A child's attention span demands speed, but the
  product's core promise demands validated, evidence-bound output. We answered
  with revision-aware job supersession (a newer revision kills the older Codex
  subprocess; superseded results are never published), a semantic visual hash
  cache that survives restarts, and saved graphs/contracts so Retry resumes at
  the image stage.
- **Keeping generated text away from the child.** Every coaching sentence a
  child reads is fixed, reviewed application copy. Getting real diagnostic
  power out of GPT-5.6 while restricting it to structured codes took careful
  schema and contract design.

## Accomplishments

- 70 passing tests across 15 files; deterministic fake provider for zero-cost
  development and judging.
- A rendering pipeline where every visual fact is traceable to the exact words
  a child wrote — and provisionality is visible, honest pencil.
- A coaching loop that provably never authors a single word of the child's
  story.

## What's next

- Ship the speech bridge ("Something's wrong? Say it!") for pre-writers.
- Classroom pilot: teacher-facing craft-card progress views.
- Close the ≤5 s render gate with a persistent app-server Codex session.
- The invitation isn't only for kids: the same evidence-bound write-see-revise
  loop works for anyone learning to express an idea clearly.

## What to enter in the Devpost form

| Field | Value |
| --- | --- |
| Project name | Maliang |
| Elevator pitch | Your words are the magic pen — a comic studio where stories come to life only through your own written words. |
| Track / category | Education |
| Video URL | https://youtu.be/fKPEeqB7PoQ |
| Repo URL | https://github.com/hyspacex/maliang |
| Codex `/feedback` Session ID | `019f6ec7-3fc0-78b2-aa28-88e033d3e9d7` |
| Built with | codex, gpt-5.6-terra, gpt-5.6-sol, gpt-image-2, electron, typescript, react, vite, zod, node.js, swift |
