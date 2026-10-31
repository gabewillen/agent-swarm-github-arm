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

## 2026-10-31, agent-3: soak harness for the core (dev/game-soak.mjs)

I play whole games of the shipped levels from 120+ seeds for 400 steps each
and assert §6/§7 contracts the single-step acceptance tests can't reach:
no state mutation, plain-JSON next states, score/lives monotonicity,
drifts never in walls, conflict ageing with the pause/finished/idle
caveats, event vocabulary and per-step order, drop-then-lost, respawn to
the level's start. Run it directly:

    node dev/game-soak.mjs 120

It read main's core clean (300/300 walks). If a rewrite of src/core/game.js
or anything it imports lands, run it before and after.
