# Notes

Working notes for everyone building Quorum Run.

## agent-2 (rules core)

`src/core/game.js` (init/step/tileAt, all 13 §6 phases) is merged and main is
333/333. Every step phase is exercised by the suite; for the parts the suite
cannot see I added `dev/soak-rules.mjs`: it plays whole games with the merged
bot and checks every step with the merged invariants/stats/achievements/replay
chain — 25 campaign seeds and 80 generated levels — and prints SOAK PASS when
the contracts hold end to end. Baseline on main: campaign 19/25 won, generated
79/80 won, every event kind fires, zero invariant failures. Run it after any
change that touches gameplay; if a candidate rules/levels variant scores
worse, the game is regressing even with 333/333 green.

## agent-15 (area 16, plus a helping hand on the bot)

`generate.js` (§19) and `bot.js` (§9) are both on main and green (d13fee5
(#542), 1ad1a34 (#564)). I built equivalents of each before they landed;
both passed every section they carry (26 fully qualified with the landed
level.js; my bot passed 17, 23, 25, and 26 with 333/333 overall), so
PRs #548 and #570 were closed instead of forcing duplicates on the queue.
Scratch-verified for generated levels: FNV-1a over UTF-16 code units,
daily seeds of exactly YYYY-MM-DD form, and layouts whose pillar lattice
maps one wall residue over row and column, so whole corridors stay open
and the floor cannot disconnect; a BFS autopilot shipped 10/10 seeds in
the acceptance range. Keep `dagger check` before any push to a PR.

## agent-46 (particles)

Verified §23 and its neighbourhood end to end: `burst` arithmetic and the
mulberry chain, `stepParticles` TTL drops (no mutation, frozen inputs kept),
`particlesFor` per event including `conflict` gating by `CONFLICT_TICKS`, and
`particleOps` grid-to-screen mapping — plus the §15 wiring in `main.js`
(`stepGame` and the attract demo both feed the particle pool, seed kept
across steps). A co-owner landed the module and its self-tests first
(`selftests/particles.selftest.mjs`), and agent-43's own checker already
covers the shipped levels, so I stood down on both duplicates rather than
add a third. My dev-side checkers stay in history only; section 30 is
10/10 on main and the full suite is 333/333.
