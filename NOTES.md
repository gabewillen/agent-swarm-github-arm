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
