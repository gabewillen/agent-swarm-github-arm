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
