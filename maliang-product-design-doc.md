# Maliang — Product Design Document

**Product name:** Maliang
**Version:** 0.2 — writing-helper interaction
**Date:** July 2026
**Owner:** Harry

---

## One-liner

A comic-making app where a kid's words are the only paintbrush. Whatever they write gets drawn — exactly, literally, and nothing more — so the only way to get a better picture is to write better words.

## The problem

Kids aged 8–10 have vivid imaginations and vague prose, and nothing in their world makes that gap visible. A kid writes "the dog ran" while picturing a scruffy terrier squeezing under a fence, and neither the kid nor the reader ever knows what was lost. Feedback, when it comes at all, arrives days later as red ink from an adult — which is why revision is the most hated part of writing instruction, and why kids get so little of the one practice that actually builds the skill.

The insight this product is built on: if a machine renders *only what the words say*, the gap between imagination and prose becomes visible in seconds, and closing it requires better words. Feedback stops being criticism from a person and becomes a consequence from the world — the same reason a kid who melts down over one red mark will happily retry a video game level fifty times.

## Who it's for

**Primary user:** kids 8–10, US grades 3–5. This is the sweet spot for three reasons. It's peak graphic-novel obsession (Dog Man, Raina Telgemeier), so authoring your own comic is aspirational. It's exactly where school curricula teach narrative writing — descriptive detail, dialogue, event sequence (CCSS W.3.3–W.5.3) — so the skills transfer visibly to school. And it's an age with a specific mechanical profile: fluent narrators, 5–10 wpm typists, which drives the voice-to-draft, keyboard-to-revise design.

**Buyer:** parents. The parent promise is one sentence: *the AI never writes a word — your kid writes, the app draws.* Screen time that produces a printable artifact and school-relevant skill.

## Product principles

These are the non-negotiables. Most product decisions can be derived from them.

1. **The AI draws, never writes.** Zero generated text, zero autocomplete, zero suggestions of wording. The kid is the only author.
2. **The illustrator is dumb on purpose.** It renders what the words say, not what the kid meant. If it helpfully fills gaps, the teaching signal disappears. Engineering this restraint is the product.
3. **Words are the only controls.** There is no button that fixes a picture. Voice can draft and voice can complain, but only changed text changes the world.
4. **Only teach what renders.** Every lesson must have a visible consequence in the panel. Grammar and spelling fail this filter and are excluded entirely.
5. **Feedback is consequence, not critique.** No scores, no rubrics, no red ink. The picture simply is what the words earned.
6. **Instruction comes after the attempt.** Micro-lessons appear at the moment of failure, when the kid has a slot for them — never as up-front teaching.
7. **The helper asks; the child decides.** Coaching begins with “Is that how you pictured it?”, accepts “keep it” as a complete answer, and asks at most one neutral question before returning control to the child's own editor. It never supplies a word, sentence, example, or plot choice.

## The core experience

The screen is split: the kid's story on the left, their comic on the right. Each paragraph becomes a panel.

A session looks like this. The kid *tells* the first panel out loud; the transcript appears as their editable text. Within seconds the panel renders — and anything the words didn't specify appears as gray pencil sketch, while described details come in ink and color. Words paint the world in. The kid protests — "no, the dragon's supposed to be tiny!" — and the app treats the protest as a diagnostic, because that spoken complaint is the only place the kid's actual intent is visible. It nudges: "What word would shrink him?" The kid types a small edit. Only the changed element re-renders. The pencil turns to ink.

When a picture disappoints in a predictable way, a fifteen-second tip appears at exactly that moment — "Pictures can't see feelings. What did Tom *do*?" — optionally backed by a collectible **craft card** showing how a professional author solves the same problem. Cards are earned only after a genuine attempt; the collection is the curriculum in disguise.

The first weak visual result starts a consent-first **picture check**, not a grade. Maliang asks whether the pencil-heavy picture matches what the child imagined. The child can keep it, defer the helper, or say “not yet.” If they want help, Maliang lets them choose a neutral focus such as action, appearance, or setting, asks one reviewed question, and puts focus back in the unchanged story editor. After the child makes their own revision, Maliang redraws and asks whether the result is closer. The loop is interactive, but every story word and every decision remains the child's.

A story is five or six panels, one sitting, loosely slotted on a story spine (character and setting → problem → attempts → resolution). Every session ends with a real, finished comic with the kid's name on it — printable, shareable, theirs.

## Key mechanics

**Sketch-to-ink rendering.** Unspecified elements render as pencil placeholder; described details render in ink and color. This makes vagueness unmissable (a gray world is obviously unfinished), rewards specificity viscerally, and neutralizes model randomness — undescribed things are visibly provisional rather than misleadingly concrete.

**Honest failure at both ends.** Underwriting renders sparse and gray. Overwriting renders honestly too: twelve stacked adjectives produce a cluttered, chaotic panel rather than a tastefully composed one. The gradient must point at *selection*, not just density, or the app trains purple prose.

**Feelings don't render.** Interior states ("Tom was scared") produce a blank-faced character. Externalized behavior ("Tom hid behind the door, peeking out") produces fear. Show-don't-tell, taught by the medium's own limitation.

**Speech bubbles from quotation marks.** Dialogue renders as bubbles if and only if it's properly quoted. Punctuation taught by the medium.

**Complaint-as-diagnostic.** Spoken protests reveal intent the app otherwise can't know. Coaching is generated from the gap between intent and text — far sharper than generic tips.

**Look → choose → revise → compare.** Proactive help comes only after a current, validated picture exposes a renderable gap. It never judges vocabulary, spelling, grammar, reading level, or word count. A renderer mistake is retried as a drawing problem rather than blamed on the writing.

## The skill ladder

One filter governs the curriculum: **only teach what renders.** In order:

1. Precise nouns and adjectives → what things look like (the core loop; needs no instruction)
2. Strong verbs → pose and action ("went," "crept," and "stomped" are three different drawings)
3. Show-don't-tell → faces and body language
4. Dialogue → speech bubbles
5. Setting details → backgrounds stay pencil until described
6. Sequencing → panel order, and visible gaps in the strip

**Explicitly excluded:** grammar, spelling, persuasive writing. **Deferred to Reader mode (Phase 3):** tension, stakes, audience effect — the things pictures cannot show.

## Product phases

**Phase 0 — Renderer feasibility (2 weeks, no UI).** Answer two questions on existing hardware: can we make a model render literally (gaps included, no helpful inference), and can we hold a character consistent across six panels? If either fails hard, the product concept fails cheap.

**Phase 1 — The Gym (first kid-facing prototype).** Inverted loop: the app shows a target scene; the kid writes until their render matches it; the diff is objective. This isolates the product's biggest behavioral unknown — the anchoring bet, below — at roughly a tenth of the full build. Success looks like kids revising voluntarily and repeatedly, protesting mismatches, and asking to play again.

**Phase 2 — The Author (the real product).** Full authoring experience as described above. The Gym survives inside it as practice drills.

**Phase 3 — The Reader.** An AI reader that reacts to the story — laughs, gets confused, predicts the ending (if it guesses right, you're predictable). This is where narrative craft and audience awareness get taught: everything pictures can't render. It is the upper floors of the ladder, not a competing product.

## Technical sketch

The load-bearing component is not a prompt — it's a **scene state**. Parse the kid's text into a structured scene graph per panel: characters with attribute slots, actions, setting, dialogue. Render from the graph against a fixed character reference sheet. Three hard problems fall out of this single representation:

- **Literalness** becomes enforceable: the renderer only sees filled slots.
- **Sketch-to-ink** becomes derivable: unfilled slots render as pencil.
- **Consistency and cost** become tractable: edits diff the graph, and only changed elements re-render against the reference sheet.

**Latency budget: ≤5 seconds** from edit to updated panel. This is pedagogical, not cosmetic — a child's attribution between cause (the word) and effect (the picture) decays fast, and the entire teaching mechanism depends on that link.

**Voice:** transcription must be ephemeral or on-device; no audio retention (see COPPA below).

## Risks and open questions

**The anchoring bet (biggest).** The whole theory assumes kids defend the picture in their head against the one on screen. Some will instead adopt the generic render as "what happens in my story" and stop revising. No design detail guarantees the protest reflex; only playtests answer this. The Gym exists to answer it early.

**The purple-prose gradient.** Pictures reward detail density; craft is detail selection. Clutter-renders-as-clutter partially corrects this, but the long-term fix is Phase 3, where the goal shifts from "match my head" to "land an effect on a reader." Watch for maximalism in testing.

**Story doesn't render.** Six gorgeous panels of nothing happening still look great. Panel gaps catch missing events, not missing tension. Accepted risk for v1; kids may plateau at pretty-but-flat until the Reader ships.

**COPPA and privacy.** Under-13 users, voice input, generated content: this is a compliance project, not a checkbox — verifiable parental consent, no audio retention, aggressive data minimization. Budget it like a feature.

**Moderation.** Kids will write violence, gross-out, and personal material. Needs a render-safety layer plus a graceful, non-shaming "I can't draw that one" path.

**Unit economics.** Every edit is a render. Scene-graph diffing and cheap pencil-layer renders are the mitigations; model costs need a real projection before Phase 2.

## Success metrics

**North star: voluntary revisions per panel.** Revision is the practice that builds the skill; the product exists to make kids want it. Supporting metrics: words changed per session, stories finished, weekly return rate, and a blind-rubric pre/post writing sample scored for specificity and sensory detail. **Explicit non-goal:** time in app.

## Out of scope for v1

Grammar and spelling instruction, AI text suggestions of any kind, social features beyond export/print, non-narrative writing modes, multiplayer.
