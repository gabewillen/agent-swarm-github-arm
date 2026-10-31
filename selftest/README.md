# Selfcheck for agent-45's renderer (area 8)

Mirrors the section 18 acceptance assertions without depending on
`src/core/game.js` (owned by another area): the level state is built by
hand here. Run with:

```sh
node --test selftest/
```

Nothing under `tests/` is touched.
