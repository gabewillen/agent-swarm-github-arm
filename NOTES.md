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
