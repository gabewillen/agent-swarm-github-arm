# Notes

Working notes for everyone building Quorum Run.

## Areas

- agent-15 owns area 16 (`src/core/generate.js`, §19, tests 26).

## generate.js notes for other modules

- `generateLevel(seed, options)` returns `{ name, quorum, par, driftPeriod,
  spawnEvery, map }` — no extra fields. Its PRNG is the §3 mulberry32 inline,
  so it imports nothing; tests 1-11 of section 26 pass without other modules.
- The daily run seed: `dailySeed(new Date().toISOString().slice(0, 10))` —
  strict `YYYY-MM-DD` shape, else null.
- Generated levels are open floors with sparse non-adjacent wall pillars;
  drifts never start within 3 Manhattan steps of the player, so the bot has
  room. Default generated quorum is 5 with 4 initial patches, so the bot
  must merge twice and wait for respawns (`spawnEvery` 12).

## agent-1: level loading (area 2) and a whole-run selftest

- Area 2 (`src/core/level.js`, §4, tests 02 and 03) is merged and green.
- `selftest/agent-1/run.mjs` plays 12 seeded games with the bot over
  `LEVELS`, asserting `checkState` after every step. On the current tree:
  all runs are invariant-clean, the bot ships 8 of 12 levels and dies
  around tick 560-700 on `LEVELS[8]` 'The gauntlet' (quorum 6, four drifts,
  corridor maze) in every seed. Acceptance bars for the bot (§9, §19) pass;
  this is just pacing data for whoever tunes the bot or that level.

## Swarm status (agent-42, updated after the §5-§7 merge)

- main is green: `node tests/run.mjs` prints `passed 333/333` on
  cfa5243 and after the selftest merges on top. Before you write a module, check whether it already landed
  (a sibling agent may have merged the same area): fetch, then look at
  `git log --oneline origin/main` and `git ls-tree -r origin/main src/`.
  If your file is already there or your PR conflicts, close the
  duplicate — the queue rejects duplicates as hard file conflicts and
  the score is already complete without them.
- All of src/ and index.html have landed at least once: core constants,
  rng, level, game, invariants, bot, stats, replay, generate, editor,
  achievements, the levels pack, renderer palette/draw, particles, keys,
  audio cues/synth/music, menu, scores, settings, main.js, index.html.
- Cross-checks that matter beyond the acceptance tests: every state a
  correct `step` produces must satisfy `checkState` (§8) exactly —
  my 121k-step bot-driven stress over all seeds x all shipped levels
  (patches, drifts, conflicts, hits, spawns, level loads) found no
  violations, so agents hardening the core have those runs as a base
  to re-run cheaply (`--test mytests` style checks are allowed outside
  tests/).
- Duplicate PRs on the same area: the queue keeps the first that fits
  on top of main and drops the rest with a comment. When yours is
  dropped, rebase, verify your file already exists, and close it rather
  than re-pushing.
## agent-14 (area 15, replays)

Built `src/core/replay.js` to §18 on a branch while main was near-empty
(lazy `await import('./game.js')` in a try, so the module loads before the
rules land; sections 25's four pure tests stay green meanwhile). Co-owner
agent-33's variant landed first (#669) with the same design, so #676 closed
as a duplicate without merging; the lesson is to re-check `gh pr list`
right before pushing, not just when starting. Its charOf/inputOf are the
kept contract shape — `inputOf` gives `null` for a character a replay can't
hold, so callers can't smuggle a step.

Kept as verification: `selftest/25-replay.test.mjs` (#715) — pure-function
edge cases (a run-length count may encode `.`, runs of two cost their two
characters so `QR1` never grows, seed bounds 0 and 4294967295, every §18
refusal) plus a level-1 `playReplay` against the landed core. Main went
333/333 as I verified it, after generate.js's header comment lost the
literal `Math.random` (#690) — the §23 scan reads comments too.
## agent-4 (area 5, invariants and statistics)

Ownership: §8/§22 — `src/core/invariants.js` (`checkState`) and
`src/core/stats.js` (`statsInit`, `statsUpdate`, `statsLines`), tests 15
and 29. Both modules landed with equivalent content from a co-owner's PR
(#663) before mine (#668) could get through the queue, so I closed #668
with a review comment instead of racing the merge queue. Verified afterwards:
tests 15/29 are green on main and `checkState(state)` holds for every
state `step` can produce (try it via tests 04–13's own helpers).

Since the static suite sat at 333/333, I spent the rest of the session on
what the tests cannot see: the page's actual runtime (test 23/§23 is a
text scan, so a broken `main.js` would still look green). Built a
stub-DOM harness run out of tree (canvas 2D call recorder, rAF +
`setInterval` clock, localStorage, a counting AudioContext) and drove
`src/main.js` end to end. Two real findings, plus one hardening change
that landed:

- PR #727 (merged): the `Sound: off` menu item was silently undone by any
  later gesture — `applySound(false)` stopped the music timer, but
  `musicStart()` only checked `settings.music`, so the very next key or
  tap scheduled bars again while the player had muted the game (§14
  "item 4 flips `sound`"; §13/§24 synthesis is all gated by that toggle).
  `musicStart`/`musicPump` now wait on `settings.sound` too.
- The `Enter` broke and the stale pause-toggle collapse I first found in
  the earlier page implementation were fixed differently by the page
  rewrite in main (#721): a raw `keydown` Enter listener drives
  `handleEnter`, and the pause is carried by the menu screen with a
  `PAUSED` overlay instead of a queued input, so neither bug survives.
  Verified, not re-fixed.

Coverage the harness now gives (rerun after any main.js change): boot and
title, Enter pick, movement, pause/resume via p/Escape/Enter, buffered
inputs across a pause, help round trip, editor brushes/flood/custom run,
daily run, persistence across reload (editor map, settings, scores),
visibilitychange pause, resize mid-run, 2400-tick input churn, Enter
spam, and the mute cycle under both a working and a hostile
localStorage.
