# maestro/scratch — hand-debug flows, OUTSIDE the flow corpus

**Purpose:**  Hold one-off, hand-written Maestro YAML that is NOT part of the suite, so the gates never see it.
**Owner:**    whoever wrote the file (none are referenced by any tool, script, or doc).
**Status:**   ACTIVE — four files moved here 2026-10-16 (S7.1).
**Source of truth:** the flow corpus is `maestro/flows/**`; this directory is outside it.
**Related (concrete paths):**
  - `maestro/tools/flow-load-check.cjs` — walks `maestro/flows/` only
  - `maestro/tools/flow-xcheck.cjs` — walks `maestro/flows/` only
  - `maestro/tools/testid-flow-currency.cjs` — scans `maestro/flows/` selectors
  - `maestro/COVERAGE-MANIFEST.md` — the flow inventory + round notes
**Last verified:** 2026-10-16, by coding model — `find maestro/flows -name "*.yaml" | wc -l` → 118 after the move.
**How to update:** add scratch flows here, never under `maestro/flows/`. A file that becomes part of the suite belongs in the corpus with a real header; delete it here in the same change.

## Why this directory exists

`maestro/flows/` is a GATED corpus, not a scratchpad. Four files
(`scratch-driver-login.yaml`, `scratch-login-tap.yaml`, `scratch-test-r9.yaml`,
`setup-phone-a-driver.yaml`) were sitting in its root as untracked local debug
files. They were never referenced by anything — grep over `maestro/`, `scripts/`,
`.github/`, `AGENTS.md`, `CLAUDE.md` found zero hits — but living in the corpus
root meant every flow-count, every `--all` sweep, and the flow-load engine step
ran over them, and the "111 flows" figure quoted in
`maestro/tools/flow-load-check.cjs` counted them.

They are kept (not deleted) because none of them is mine to discard, and a
scratch login helper is plausibly still useful to whoever wrote it. Moving them
here removes them from every gate's input without losing the content.

## The standing rule

Anything under `maestro/flows/` is expected to LOAD (engine-verified referenced
paths, `runScript` file forms, `when:` map shapes) and to resolve every `id:`
selector and copy literal. If a flow cannot meet that, it does not go in the
corpus — it goes here, or it gets a header explaining why and a `tags: [blocked]`
marker (the precedent: `rider/booking/05-scheduled-ride.yaml`).
