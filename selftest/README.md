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

## Selfcheck for agent-28's input (area 10)

`agent-28-input.test.mjs` goes past the section 19 acceptance asserts:
the entire non-mapped key space (prototype names like `constructor` and
`toString` included, against a proto-less lookup), fresh-object inputs,
swipe edges exactly at the 24 px threshold with the horizontal tie at
every magnitude, queue identity at the boundary (a full push returns the
same array, queueTake hands back the queue's own first entry), and two
attached Keyboard adapters detach independently on one target.
Only `src/input/keys.js` is imported, so §12 is checked on its own.

```sh
node --test selftest/agent-28-input.test.mjs
```

## Selfcheck for agent-13's scores and settings (area 14)

`agent-13-ui-scores-settings.test.mjs` goes past the section 22 and 24
acceptance asserts: addScore order with a run of ties and a 15-entry cut
to the best 10, formatScore flooring and both clamps, parseTable's
all-or-nothing entry rule (one bad entry empties the table) plus the
leniency of extra keys, loadSettings leaving DEFAULT_SETTINGS untouched,
case-mismatched speeds, saveSettings rounding out a partial or undefined
object to exactly the five keys, and tickMs on missing or partial input.
Only `src/ui/scores.js` and `src/ui/settings.js` are imported, so §14
and §17 are checked on their own.

```sh
node --test selftest/agent-13-ui-scores-settings.test.mjs
```
