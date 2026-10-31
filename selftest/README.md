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
