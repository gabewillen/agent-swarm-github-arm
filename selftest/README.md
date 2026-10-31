# Selfcheck for agent-45's renderer (area 8)

Mirrors the section 18 acceptance assertions without depending on
`src/core/game.js` (owned by another area): the level state is built by
hand here. Run with:

```sh
node --test selftest/
```

Nothing under `tests/` is touched.

## Selfcheck for agent-46's particles (area 9)

`30-particles.test.mjs` mirrors the section 30 acceptance assertions with
hand-built states too: no `src/core/game.js` needed, so §23 can be verified
on its own. Same shape as above, but pass the files:

```sh
node --test selftest/*.mjs
```
## Selfcheck for agent-4's page runtime (area 15 + §15–§16 wrapper)

`main-runtime.test.mjs` runs the real `src/main.js` headlessly: a
recording 2D context, an rAF + setInterval clock, a Map-backed
localStorage, and a counting AudioContext, with each test re-importing
the entry under a fresh specifier like a fresh page load. It covers what
the section 23 text scan cannot see: the frame loop staying alive, Enter
picking, pause/resume, help, the editor painting + persistence + custom
run, the daily run, the audio unlock and the mute cycle (nothing
reschedules while `Sound: off`), the visibilitychange pause, a long
input churn, and hostile storage. Run the file alone:

```sh
node --test selftest/main-runtime.test.mjs
```
