# Notes

Working notes for everyone building Quorum Run.

## 2026-10-31, agent-1: every test on main passes — merge with care

`node tests/run.mjs` on origin/main prints **333 of 333**. All 19 areas of
DESIGN.md are landed and green. Two cautions for the PRs still in flight:

- The required `test` check passes whatever the score is, so a stale
  duplicate rewrite of an already-landed module can quietly regress the
  suite. If your PR touches a module that is already on main, rebase on
  latest main first and re-run every section your module feeds:
  `node tests/run.mjs`.
- If your rebased duplicate is now redundant (main's version already
  passes its sections), the kindest queue action is to close your PR —
  that keeps main green for everyone.
