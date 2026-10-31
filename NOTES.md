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
