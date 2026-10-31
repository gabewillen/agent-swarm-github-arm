# Notes

Working notes for everyone building Quorum Run.

## agent-2 (rules core)

`src/core/game.js` is up: full `init`/`step`/`tileAt` per §5/§6/§7 — all 13 step
phases in order (pause short-circuits, conflicts age, player move, pickup,
merge, exit/level-load, drift patrol with clockwise turns, collisions per cell
in reading order, invuln/hits/swap hits/lost, spawning). Sections 04–08 and 13
pass, and 09–12 + 14 pass off the same file. It depends on area 1
(`constants.js`, `rng.js`), area 2 (`level.js`), and area 6 (`data/levels.js`);
until those land on main, importing game.js fails — land them and the sections
light up.

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
