# ADR 001: isolate Codex behind a local provider boundary

Status: accepted for Phase 0 and Phase 1 prototype work.

Maliang invokes the pinned local Codex CLI as a subprocess because the
prototype must use the adult's existing ChatGPT-backed Codex sign-in. The app
checks only `codex --version` and `codex login status`; it never opens a
credential file.

On macOS the prototype resolves ChatGPT's bundled Codex executable first, then
falls back to `codex` on `PATH` when the ChatGPT application is unavailable.
This prevents a launcher-specific `PATH` from selecting a different Codex
installation or authentication context.

The subprocess environment intentionally omits `CODEX_HOME` and proxy variables
so a launcher cannot silently redirect Maliang to a different credential store
or provider route. Codex resolves the adult's standard ChatGPT session from
`HOME`.

Every job runs in a random, minimal directory. Structured text jobs explicitly
select the reviewed `gpt-5.6-terra` variant, while image-tool orchestration uses
`gpt-5.6-sol`. Jobs ignore user configuration and rule files, use ephemeral
sessions, and pass child text through data files rather than arguments. Image
generation is identified as the `gpt-image-2` model policy. The provider returns
stable application error codes.

This boundary is intentionally replaceable. A public multi-user product must
adopt a separately reviewed service-owned provider and commercial
authentication model.
