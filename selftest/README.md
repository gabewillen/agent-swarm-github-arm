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

## Selfcheck for agent-30's music (area 12)

`31-music.test.mjs` goes past the section 31 acceptance assertions: the
§24 pitch formula over a wide degree/octave grid, tempo caps, bar purity
and range over level/bar space (including negatives and the parity of the
4-bar loop in both directions), a pin on the shipped tune, and
scheduleBar timing at 96, 120, and 160 bpm through a fake AudioContext.
Only `src/audio/music.js` is imported, so §24 is checked on its own.
Same runner as the other selfchecks (directory args don't glob on
every Node; the wildcard form works):

```sh
node --test selftest/*.mjs
```
