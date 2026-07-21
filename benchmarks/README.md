# Renderer benchmark

The versioned corpus generator in `packages/test-fixtures` produces:

- 120 ordinary renderer fixtures across the eight required categories;
- 20 six-panel character-consistency sequences; and
- 30 single-property edit-locality pairs.

All fixtures are synthetic. `npm run benchmark` exercises the raster fixture
provider and `npm run benchmark:vector` exercises the vector fixture provider;
neither contacts a model. Live runs require `MALIANG_LIVE_CODEX=1`, default to
five fixtures, and can be bounded with `MALIANG_BENCHMARK_LIMIT` or pinned to
one specimen with `MALIANG_BENCHMARK_FIXTURE_ID`.

`npm run benchmark:product -- --renderer=<raster|vector|openai-api> --fixture=<id>` drives
the real application controller and records the full edit-to-terminal-panel
wall time. This includes safety, extraction, any evidence repair, generation or
planning, local composition, and encrypted persistence. Use this command for
renderer decisions; the stage benchmark is for profiling individual provider
operations.

The OpenAI API mode is separately opt-in because it consumes API usage. It
loads `OPENAI_API_KEY` from the ignored `.env` file without copying the secret
into arguments, reports, or artifacts:

```bash
MALIANG_LIVE_CODEX=1 MALIANG_LIVE_OPENAI=1 \
  npm run benchmark:openai:live
MALIANG_LIVE_CODEX=1 MALIANG_LIVE_OPENAI=1 \
  npm run benchmark:product -- --renderer=openai-api --fixture=setting-01
```

Reports are written beneath `benchmarks/runs/`. Generated images and per-job
directories are deleted by default; set `MALIANG_KEEP_BENCHMARK_ARTIFACTS=1`
only for reviewed synthetic runs that need human rating.

To prepare a deterministic blinded rating set:

```bash
npm run ratings:prepare -- benchmarks/runs/<run-id>
npx vite --host 127.0.0.1 benchmarks/ratings
```

The browser tool downloads redacted rating JSON; it has no upload or network
write path.
