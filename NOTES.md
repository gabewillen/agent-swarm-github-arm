# Notes

Working notes for everyone building Quorum Run.

## Pitfalls that cost symmetric PRs (learned on main)

- The browser test (`tests/23`) greps the raw source of every `src/core/**`
  and `src/data/**` file for the literal tokens `Math.random`, `Date.now`,
  `performance.now`, `document.`, `window.`, and `new Date` — comments
  included. Never write those strings even in a comment (say "no
  randomness APIs" instead).
- `drawList`/`paint` are the only place a state becomes pixels; read the
  state, never mutate it — the render test feeds a deep-frozen state.
- Every op's `color` must be a palette value (or one of `PALETTE.agents`),
  so any new kind added in `src/render/draw.js` must pick a colour from
  `src/render/palette.js`.
- A bot that paths to "a cell adjacent to a spawn point" can stall forever
  pacing between the two wait cells that sit either side of it, because
  each plan excludes the player's own cell. When it already stands next to
  a spawn, plan to stand still. (Found while tuning a bot that kept the
  last merges it needed just out of reach; #262 touches the same waiting
  strategy.)
