# Quorum Run: game design

Quorum Run is a small top-down arcade puzzle game for the browser. You are a
courier agent on a grid. Patches appear on spawn points; you pick them up,
carry up to three, and merge them on a merge pad. Once a level's quorum of
merged patches lands, its hold doors and its exit open, and you ship the
level by reaching the exit. Drifts patrol the grid: touch one while carrying
patches and you drop them all; touch one empty-handed and you lose a life.
When two drifts run into each other they leave a conflict, a block nobody
can pass for a while.

This document is the contract. The acceptance tests in `tests/` check it,
names and shapes exactly. Section numbers are referenced by the tests.

## 1. Architecture

Plain ES modules, no build step, no runtime dependencies, no Node-only API
anywhere in `src/`: the game must run by opening `index.html` from a static
web server. Every import is relative and names its `.js` extension.

| Module | Exports | Purpose |
|---|---|---|
| `src/core/constants.js` | the constants of §2 | numbers every module shares |
| `src/core/rng.js` | `rngNext`, `rngInt` | the seeded PRNG (§3) |
| `src/core/level.js` | `parseLevel`, `validateLevel` | level loading and validation (§4) |
| `src/core/game.js` | `init`, `step`, `tileAt` | the rules (§5 to §7) |
| `src/core/invariants.js` | `checkState` | state validation (§8) |
| `src/core/bot.js` | `botInput` | an autopilot that plays the game (§9) |
| `src/data/levels.js` | `LEVELS` | the shipped levels (§10) |
| `src/render/palette.js` | `PALETTE` | colours (§11) |
| `src/render/draw.js` | `HUD_HEIGHT`, `layout`, `drawList`, `paint` | the canvas renderer (§11) |
| `src/input/keys.js` | `keyToInput`, `swipeToInput`, `queuePush`, `queueTake`, `attachKeyboard`, `INPUT_QUEUE_MAX` | input (§12) |
| `src/audio/cues.js` | `CUES`, `cuesFor` | which sound each event makes (§13) |
| `src/audio/synth.js` | `createAudio` | WebAudio synthesis, no samples (§13) |
| `src/ui/menu.js` | `menuInit`, `menuReduce`, `menuItems`, `hudText` | menus and HUD text (§14) |
| `src/ui/scores.js` | `addScore`, `formatScore`, `parseTable` | the high-score table (§14) |
| `src/ui/settings.js` | `DEFAULT_SETTINGS`, `loadSettings`, `saveSettings`, `tickMs` | player settings (§17) |
| `src/core/replay.js` | `charOf`, `inputOf`, `recordReplay`, `encodeReplay`, `decodeReplay`, `playReplay` | replays (§18) |
| `src/core/generate.js` | `hashSeed`, `dailySeed`, `generateLevel` | generated levels and the daily run (§19) |
| `src/core/editor.js` | `editorInit`, `editorPaint`, `editorFill`, `editorResize`, `editorErrors`, `editorExport`, `editorImport` | the level editor (§20) |
| `src/core/achievements.js` | `ACHIEVEMENTS`, `checkAchievements` | achievements (§21) |
| `src/core/stats.js` | `statsInit`, `statsUpdate`, `statsLines` | run statistics (§22) |
| `src/render/particles.js` | `PARTICLE_TTL`, `burst`, `stepParticles`, `particlesFor`, `particleOps` | particle effects (§23) |
| `src/audio/music.js` | `SCALE`, `ROOT_HZ`, `noteHz`, `tempo`, `bar`, `scheduleBar` | generative music (§24) |
| `src/main.js` | nothing | the browser entry: wires everything (§15) |
| `index.html` | | the page (§15) |

Rules for every module:

- The core (`src/core/**`, `src/data/**`) is pure and render-free: no
  `document`, `window`, `Math.random`, `Date.now`, or `performance.now`.
  Randomness comes only from the state's seed (§3).
- No module but `src/main.js` touches the DOM, `window`, or an
  `AudioContext` when it is imported. Functions may use objects they are
  given (a canvas context, an event target, an AudioContext constructor).
- No `require(`, no `process.`, no `node:` imports, no bare imports.
- Every state the core returns is plain JSON data: arrays, objects,
  strings, finite numbers, booleans, `null`.

## 2. Constants (`src/core/constants.js`)

| Name | Value | Meaning |
|---|---|---|
| `CARRY_MAX` | 3 | patches the player can carry |
| `START_LIVES` | 3 | lives at `init` |
| `INVULN_TICKS` | 6 | ticks of immunity after a hit or a drop |
| `CONFLICT_TICKS` | 10 | a conflict's life in ticks |
| `PATCH_BASE` | 100 | base points per merged patch |
| `SAME_COLOR_BONUS` | 50 | bonus per patch for a same-colour merge of 2 or more |
| `TIME_BONUS_PER_TICK` | 10 | points per tick under par at the exit |
| `COLORS` | 4 | patch colours, numbered 0 to 3 |
| `TICK_MS` | 120 | real milliseconds per tick in the browser |
| `DIRS` | `{ up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] }` | moves as `[dx, dy]` |
| `CLOCKWISE` | `['up', 'right', 'down', 'left']` | turn order |

`x` grows to the right and `y` grows down; `(0, 0)` is the top-left cell.

## 3. Randomness (`src/core/rng.js`)

The PRNG is mulberry32 on a 32-bit unsigned state. `rngNext(seed)` returns
`{ value, seed }`: `value` in `[0, 1)` and the next state. Exactly:

```
t = (seed + 0x6D2B79F5) >>> 0          // the next state
r = Math.imul(t ^ (t >>> 15), t | 1)
r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
value = ((r ^ (r >>> 14)) >>> 0) / 4294967296
return { value, seed: t }
```

`rngInt(seed, n)` returns `{ value: Math.floor(v * n), seed: s }` for
`{ value: v, seed: s } = rngNext(seed)`, so an integer in `[0, n)`.

The game state holds the PRNG state in `state.seed`; every draw replaces it.

## 4. Levels (`src/core/level.js`)

A level definition is an object:

```
{ name: 'First merge', quorum: 3, par: 120, driftPeriod: 2, spawnEvery: 20,
  map: ['#######', '#@.P.M#', '#..X..#', '#######'] }
```

- `name`: a non-empty string; `quorum`, `par`, `driftPeriod`,
  `spawnEvery`: positive integers.
- `map`: a non-empty array of strings, one per row, of these characters:

| Char | Cell |
|---|---|
| `#` | wall |
| `.` | floor |
| `@` | the player's start (floor) |
| `P` | a patch spawn point (floor) |
| `M` | merge pad |
| `X` | the exit |
| `H` | a hold door |
| `^` `>` `v` `<` | a drift's start, facing up, right, down, or left (floor) |

`validateLevel(def)` returns `{ ok, errors }`: `errors` an array of codes
in this order, each at most once, and `ok` true when it is empty:

1. `bad_fields`: a field above missing or of the wrong type or range. When
   it is present no other check runs and it is the only code.
2. `ragged`: rows of different lengths.
3. `too_big`: wider than 32 or taller than 24 cells.
4. `bad_char`: a character not in the table.
5. `no_border`: a cell on the outer edge that is not `#`.
6. `player_count`: not exactly one `@`.
7. `exit_count`: not exactly one `X`.
8. `no_merge`: no `M`.
9. `no_spawn`: no `P`.
10. `unreachable`: a `P`, `M`, or `X` that can't be reached from the `@`
    by up, down, left, and right steps through cells that are not `#`
    (holds and the exit count as passable here). Checked only when there
    is exactly one `@`.

`parseLevel(def)` throws an `Error` whose message starts with
`invalid level` when the definition is not valid, and otherwise returns:

```
{ name, quorum, par, driftPeriod, spawnEvery, width, height,
  tiles,   // array of strings: the map with '@', 'P', and drift chars as '.'
  start,   // { x, y } of the '@'
  spawns,  // [{ x, y }] every 'P', in reading order (row by row, left to right)
  drifts } // [{ x, y, dir }] every drift char in reading order, dir 'up' | 'right' | 'down' | 'left'
```

## 5. State (`src/core/game.js`)

`init(seed, options)` returns the first state. `options` is optional:
`options.levels` (an array of level definitions, default `LEVELS` from
`src/data/levels.js`) and `options.level` (the starting level index,
default 0). The state is:

| Field | Value at `init` |
|---|---|
| `seed` | the PRNG state, `seed >>> 0` before the draws below |
| `tick` | 0: steps taken while playing (§6) |
| `levelTicks` | 0: ticks since the current level began |
| `levels` | the level definitions |
| `levelIndex` | the starting index |
| `level` | `parseLevel` of the current level's definition |
| `player` | `{ x, y }`, the level's start |
| `carried` | `[]`: the colours of the carried patches, in pickup order |
| `patches` | one `{ x, y, color }` per spawn point, in reading order, each colour `rngInt(seed, COLORS)` drawn in that order |
| `drifts` | copies of the level's drifts `{ x, y, dir }` |
| `conflicts` | `[]`: `{ x, y, ttl }` |
| `score` | 0 |
| `lives` | `START_LIVES` |
| `merges` | 0: patches merged on this level |
| `open` | `false`: whether the quorum is reached on this level |
| `invuln` | 0 |
| `status` | `'playing'`; later `'won'` or `'lost'` |
| `paused` | `false` |
| `events` | `[]`: what happened in the last step (§7) |

Loading a level (at `init` and on reaching an open exit) sets `level`,
`player`, `patches` (with fresh colour draws), `drifts`, and resets
`carried`, `conflicts`, `merges`, `open`, `invuln`, and `levelTicks`; it
keeps `score`, `lives`, `tick`, and the PRNG state.

`tileAt(state, x, y)` returns the level's terrain character at a cell
(`'#'`, `'.'`, `'M'`, `'X'`, or `'H'`), and `'#'` outside the map.

## 6. A step

`step(state, input)` returns the next state and never changes `state` or
anything in it. `input` is `{ move, pause }`: `move` one of `'up'`,
`'right'`, `'down'`, `'left'`, or `null`; `pause` a boolean. A missing or
`null` input, or a missing field, means no move and no pause. In order:

1. If `status` is not `'playing'`: return the state unchanged but with
   `events` `[]`.
2. If `pause` is true: flip `paused` and return with `events`
   `['pause']` or `['resume']`. Nothing else changes.
3. If `paused`: return with `events` `[]`.
4. `tick` and `levelTicks` grow by one; `events` starts empty.
5. Conflicts age: each `ttl` drops by one, and conflicts at 0 go.
6. The player moves one cell in `move`'s direction when the target cell
   is passable to the player: not a wall, not a hold or the exit unless
   `open`, and no conflict on it. Otherwise the player stays.
7. Pickup: if a patch lies on the player's cell and fewer than
   `CARRY_MAX` are carried, it leaves `patches` and its colour is pushed
   onto `carried`; event `pickup`.
8. Merge: if the player is on an `M` and carries `n > 0` patches, the
   score grows by `PATCH_BASE * n * n`, plus `SAME_COLOR_BONUS * n` when
   `n >= 2` and all carried colours are equal; `merges` grows by `n`;
   `carried` empties; event `merge`. If that makes `merges >= quorum`
   while not `open`: `open` becomes true; event `quorum`.
9. Exit: if `open` and the player is on the `X`, the score grows by
   `max(0, par - levelTicks) * TIME_BONUS_PER_TICK`. If another level
   follows, it is loaded (§5) and `levelIndex` grows by one; event
   `level`. Otherwise `status` becomes `'won'`; event `won`. Either way
   the step ends here.
10. Drifts move when `tick % driftPeriod === 0`. Each drift, in array
    order, tries its own direction, then each next direction clockwise,
    up to four; it turns to and moves one cell in the first whose target
    is passable to a drift: not a wall, not a hold, not the exit (open or
    not), and no conflict on it. Drifts ignore the player, patches, and
    each other while moving. With no passable direction it stays and
    keeps its direction.
11. Drift collisions, only on a tick when drifts moved: for each cell, in
    reading order, holding two or more drifts, every drift there reverses
    its direction (up and down, left and right swap), a conflict
    `{ x, y, ttl: CONFLICT_TICKS }` is added unless one is already on that
    cell, and event `conflict` is added once for the cell.
12. Hits: if `invuln > 0`, it drops by one and nothing hits. Otherwise the
    player is hit when a drift is on the player's cell, or when a drift
    that moved this step swapped cells with the player (the drift is now
    where the player was before step 6, and was where the player is now).
    On a hit: if carrying, `carried` empties, `invuln` becomes
    `INVULN_TICKS`, and event `drop`; if not, `lives` drops by one and
    event `hit`, then at 0 lives `status` becomes `'lost'` and event
    `lost`, else the player returns to the level's start and `invuln`
    becomes `INVULN_TICKS`.
13. Spawns, when `status` is still `'playing'` and
    `levelTicks % spawnEvery === 0` and `patches.length + carried.length`
    is below the number of spawn points: the free spawn points are those,
    in reading order, with no patch, not the player's cell, and no drift
    on them. If any are free, pick one with `rngInt(seed, free.length)`,
    then its colour with `rngInt(seed, COLORS)`, append the patch to
    `patches`; event `spawn`.

## 7. Events

`state.events` lists, in the order they happened, the events of the last
step: `pickup`, `merge`, `quorum`, `level`, `won`, `conflict`, `drop`,
`hit`, `lost`, `spawn`, `pause`, `resume`. The renderer, audio, and UI read
them; nothing else does.

## 8. Invariants (`src/core/invariants.js`)

`checkState(state)` returns an array of error codes, empty for a valid
state. It checks at least:

| Code | When |
|---|---|
| `bad_status` | `status` is not `'playing'`, `'won'`, or `'lost'` |
| `player_in_wall` | the player is off the map or on a `#` |
| `carry_overflow` | more than `CARRY_MAX` carried |
| `lives_range` | `lives` is not an integer from 0 to `START_LIVES` |
| `score_negative` | `score` is negative or not an integer |
| `patch_off_spawn` | a patch is not on a spawn point |
| `drift_in_wall` | a drift is off the map or on a `#` |
| `bad_color` | a carried or lying patch colour is not an integer in `[0, COLORS)` |

## 9. The bot (`src/core/bot.js`)

`botInput(state)` returns an input `{ move, pause: false }` for the state,
pure and deterministic. It should play well: fetch patches, merge them,
avoid drifts, and take the exit once it is open. Path-finding over the
grid is expected. The acceptance tests let it play seeded games of the
shipped levels and require it never to break a rule or crash, and to ship
the first level in most seeds.

## 10. Levels (`src/data/levels.js`)

`LEVELS` holds at least 10 valid level definitions with distinct names,
first to last in rising difficulty: the first has no drift, at least six
have drifts, and at least four have hold doors. Every level's quorum is at
most 20, and its par at least 30. Design them to be fun: corridors, holds
that gate a region, and merge pads placed so the route matters.

## 11. Look and renderer (`src/render/`)

The look is lvcs.sh's: a near-black ground, one yellow accent, four agent
colours for the patches, flat squares, thin lines, no gradients or
images.

`PALETTE` is exactly:

```
{ bg: '#111111', panel: '#1a1a1a', wall: '#2c2c2c', floor: '#161616',
  text: '#f2f2f2', dim: '#8f8f8f', accent: '#ffd400', danger: '#ff6b4a',
  agents: ['#c79bff', '#6aa8ff', '#ff9f45', '#4ade80'] }
```

`HUD_HEIGHT` is 48: a strip at the top of the canvas for the HUD.

`layout(level, view)` for `view = { width, height }` in pixels returns
`{ cell, ox, oy }`: `cell = Math.floor(Math.min(width / level.width,
(height - HUD_HEIGHT) / level.height))`, `ox = Math.floor((width - cell *
level.width) / 2)`, and `oy = HUD_HEIGHT + Math.floor((height - HUD_HEIGHT
- cell * level.height) / 2)`.

`drawList(state, view)` is pure and returns an array of draw operations,
each with a `kind`:

- `{ op: 'rect', kind, x, y, w, h, color }`
- `{ op: 'circle', kind, x, y, r, color }`
- `{ op: 'text', kind, x, y, text, color, size }`

Every `color` is a value of `PALETTE` (or of `PALETTE.agents`). The list:

1. starts with one `rect` of kind `bg` covering the whole view in
   `PALETTE.bg`;
2. has one `rect` per wall cell of kind `wall`, colour `PALETTE.wall`, at
   `x = ox + cx * cell`, `y = oy + cy * cell`, `w = h = cell`;
3. has one op of kind `merge` per merge pad, `exit` for the exit (colour
   `PALETTE.accent` when `open`, else `PALETTE.dim`), and `hold` per hold
   door (colour `PALETTE.dim` when closed, `PALETTE.floor` when `open`),
   each at its cell;
4. has one op of kind `patch` per lying patch, coloured
   `PALETTE.agents[color]`, one of kind `drift` per drift in
   `PALETTE.danger`, one of kind `conflict` per conflict, and exactly one
   of kind `player` in `PALETTE.accent`, each inside its cell's square;
5. has `text` ops of kind `hud` whose texts include `SCORE <score>`,
   `LIVES <lives>`, and `<merges>/<quorum>`;
6. has a `text` op of kind `banner` reading `PAUSED` when paused,
   `ALL MERGED` when `won`, and `GAME OVER` when `lost`, and none
   otherwise.

`paint(ctx, ops)` draws the list on a 2D canvas context: for each op it
sets `ctx.fillStyle` to its colour, then `fillRect` for a `rect`,
`beginPath`, `arc`, and `fill` for a `circle`, and sets `ctx.font` and
calls `fillText` for a `text`.

## 12. Input (`src/input/keys.js`)

- `keyToInput(key)` maps a `KeyboardEvent.key`: `ArrowUp`, `w`, `W` to
  `{ move: 'up', pause: false }`; `ArrowDown`, `s`, `S` to down;
  `ArrowLeft`, `a`, `A` to left; `ArrowRight`, `d`, `D` to right; `p`,
  `P`, `Escape` to `{ move: null, pause: true }`; anything else to `null`.
- `swipeToInput(dx, dy)` maps a touch swipe in pixels: `null` when both
  `|dx|` and `|dy|` are below 24, else a move along the larger axis
  (`dx > 0` right, `dy > 0` down; a tie goes horizontal), `pause: false`.
- `INPUT_QUEUE_MAX` is 4. `queuePush(queue, input)` returns a new array
  with `input` appended, or the queue unchanged when it already holds
  `INPUT_QUEUE_MAX` inputs or `input` is `null`. `queueTake(queue)`
  returns `{ input, queue }`: the first input and the rest, or
  `{ move: null, pause: false }` and `[]` for an empty queue. Neither
  changes its argument.
- `attachKeyboard(target, onInput)` listens for `keydown` on `target`
  (`target.addEventListener('keydown', handler)`); for a key that
  `keyToInput` maps it calls `event.preventDefault()` and
  `onInput(input)`. It returns a function that removes that same
  listener.

## 13. Audio (`src/audio/`)

All sound is synthesized with WebAudio oscillators: no samples, no files.

`cuesFor(events)` maps an events list to cue names, in order, skipping
events with no cue: `pickup` `blip`, `merge` `chord`, `quorum`
`fanfare`, `level` `sweep`, `won` `fanfare`, `conflict` `buzz`, `drop`
`scatter`, `hit` `thud`, `lost` `dirge`, `spawn` `tick`.

`CUES` maps every cue name above to `{ notes, wave, duration, gain }`:
`notes` a non-empty array of frequencies in Hz (20 to 5000), `wave` one of
`'sine'`, `'square'`, `'triangle'`, `'sawtooth'`, `duration` seconds
above 0 and at most 2, and `gain` above 0 and at most 1.

`createAudio(AudioContextCtor)` returns `{ play(name), setMuted(muted),
isMuted() }`. It constructs the context only on the first `play` that
makes a sound (browsers allow audio only after a gesture). `play` of a
known cue, when not muted, creates for each note an oscillator
(`ctx.createOscillator()`, its `type` the cue's wave, its
`frequency.value` the note) and a gain node (`ctx.createGain()`), connects
the oscillator to the gain and the gain to `ctx.destination`, and calls
the oscillator's `start` and `stop`. Muted, or for an unknown cue, it does
nothing.

## 14. Menus, HUD, and scores (`src/ui/`)

`menuInit()` returns `{ screen: 'title', selected: 0, sound: true, mode:
'campaign' }`. `menuItems(menu)` returns the title screen's items:
`['Play', 'Daily run', 'Level editor', 'How to play', 'Sound: on']`
(`'Sound: off'` when `sound` is false).
`menuReduce(menu, action)` returns a new menu and never changes its
argument. Actions are `'up'`, `'down'`, `'select'`, `'back'`, `'pause'`,
and `'gameover'`; any other leaves the menu as it was.

| Screen | Action | Result |
|---|---|---|
| `title` | `up` / `down` | `selected` moves by one, wrapping around the 5 items |
| `title` | `select` | item 0: screen `playing`, mode `campaign`; item 1: `playing`, mode `daily`; item 2: `editor`; item 3: `help`; item 4: flips `sound` |
| `help` | `back` or `select` | `title` |
| `editor` | `back` | `title` |
| `editor` | `select` | `playing`, mode `custom` (play the edited level) |
| `playing` | `pause` | `paused` |
| `playing` | `gameover` | `over` |
| `paused` | `pause` or `select` | `playing` |
| `paused` | `back` | `title` |
| `over` | `select` | `title` |

`hudText(state)` returns `['SCORE <score>', 'LIVES <lives>', 'MERGES
<merges>/<quorum>', 'LEVEL <levelIndex + 1>']`.

The high-score table is an array of `{ name, score }`, best first.
`addScore(table, entry)` returns a new table with the entry placed after
every entry with a higher or equal score, cut to the best 10.
`formatScore(n)` is the score as 6 digits with leading zeros, and
`'999999'` above that. `parseTable(text)` parses a JSON table and returns
`[]` for anything that is not an array of `{ name: string, score:
integer }`.

## 15. The page

`index.html` holds a `<canvas id="game">` and loads
`<script type="module" src="src/main.js">`; its `<title>` is `Quorum
Run`. `src/main.js` imports the core, renderer, input, audio, and UI
modules, runs `step` every `TICK_MS` with the queued input, draws with
`drawList` and `paint` on `requestAnimationFrame`, plays `cuesFor` of
each step's events, and shows the title menu first. A bot demo (the
attract mode) may play behind the title screen.

## 16. Controls

Arrow keys or WASD move; P or Escape pauses; Enter selects in menus; on
touch screens, swipe to move and tap to select.

## 17. Settings (`src/ui/settings.js`)

`DEFAULT_SETTINGS` is `{ sound: true, music: true, volume: 0.8, speed:
'normal', colorblind: false }`. `loadSettings(text)` parses JSON and returns
the defaults with every valid field of it applied: `sound`, `music`, and
`colorblind` booleans, `volume` a number clamped to `[0, 1]`, `speed` one of
`'slow'`, `'normal'`, `'fast'`; anything else (a wrong type, an unknown
key, text that is not a JSON object) is ignored. `saveSettings(settings)`
returns JSON holding exactly the five keys. `tickMs(settings)` is 160 for
`slow`, `TICK_MS` for `normal`, and 90 for `fast`.

## 18. Replays (`src/core/replay.js`)

A replay is `{ seed, level, moves }`: the `init` seed (as `seed >>> 0`), the
starting level index, and one character per step: `u`, `r`, `d`, `l` for a
move, `.` for no move, `p` for a pause input. `charOf(input)` gives an
input's character (a pause wins over a move; a missing input is `.`) and
`inputOf(ch)` the input back (`{ move, pause }`).

- `recordReplay(seed, inputs, options)` returns the replay of playing
  `inputs` from `init(seed, options)` (`options.level`, default 0).
- `encodeReplay(replay)` returns `QR1:<seed>:<level>:<moves>` where moves
  are run-length coded: a run of 2 or more equal characters is written as
  its count then the character (`uuu.r` is `3u.r`), a single one as itself.
- `decodeReplay(text)` reverses it, and returns `null` for anything that
  isn't a well-formed encoding (wrong prefix, a seed or level that is not a
  non-negative integer, a seed above 4294967295, an unknown character, a
  count with no character after it, a count below 2).
- `playReplay(replay, levels)` returns the final state of stepping every
  move from `init(replay.seed, { level: replay.level, levels })` (`levels`
  optional, as for `init`).

## 19. Generated levels and the daily run (`src/core/generate.js`)

`hashSeed(text)` is 32-bit FNV-1a over the string's UTF-16 code units:
start at `0x811c9dc5`; for each code unit, xor it in, then multiply by
`0x01000193` with `Math.imul` and keep `>>> 0`. `dailySeed(date)` takes a
`YYYY-MM-DD` string and returns `hashSeed('quorum-run:' + date)`, or
`null` when the text isn't of that form.

`generateLevel(seed, options)` returns a level definition built only from
the PRNG of §3 started at `seed >>> 0`. Options and defaults: `width` 15,
`height` 11 (7 to 32 and 7 to 24, else it throws a `RangeError`), `drifts`
2, `spawns` 4, `quorum` 5. The level:

- validates (§4) and has exactly that width and height;
- has exactly `drifts` drift characters, `spawns` `P`s, one `@`, one `X`,
  and at least one `M`;
- starts the player at least 3 steps (Manhattan distance) from every
  drift;
- is named `Generated <seed>` with the seed as given `>>> 0`, has the given
  quorum, a `par` of at least 30, `driftPeriod` 2, and `spawnEvery` 12;
- is the same for the same seed and options, and differs between most
  seeds;
- is playable: the bot (§9) ships most generated levels.

## 20. The level editor (`src/core/editor.js`)

The editor works on a level definition and never changes its argument.

- `editorInit(width, height)` returns `{ name: 'Untitled', quorum: 1, par:
  100, driftPeriod: 2, spawnEvery: 20, map }`: a map of that size (each
  clamped to 5 to 32 wide and 5 to 24 high) with `#` on the border and `.`
  inside.
- `editorPaint(def, x, y, ch)` sets one cell. It ignores a character not in
  §4's table, a cell outside the map, and any cell on the border. Painting
  `@` or `X` first turns any other `@` or `X` (the same character) into
  `.`, so there is at most one of each.
- `editorFill(def, x, y, ch)` flood-fills, through up, down, left, and
  right steps, the region of cells equal to the one at `(x, y)` with `ch`,
  never touching the border. `@` and `X` can't be filled (the definition
  comes back unchanged), nor can a border cell.
- `editorResize(def, width, height)` returns the definition at the new size
  (clamped as in `editorInit`): cells inside the new border keep their
  character where the old map had one off its border, the rest are `.`,
  and the border is `#`.
- `editorErrors(def)` is `validateLevel(def).errors`.
- `editorExport(def)` returns `JSON.stringify` of the definition, and
  `editorImport(text)` parses one back: a definition whose `validateLevel`
  has no `bad_fields`, else `null` (also for text that isn't JSON).

## 21. Achievements (`src/core/achievements.js`)

`ACHIEVEMENTS` lists `{ id, title, description }` in this order, ids
exactly: `first_pickup`, `first_merge`, `full_hands` (merge 3 patches at
once), `monochrome` (merge 3 patches of one colour at once), `quorum`,
`shipped` (ship a level), `flawless` (ship a level, or win, with all
`START_LIVES` lives), `conflict` (see a conflict), `survivor` (reach the
fourth level, index 3), `champion` (win the game).

`checkAchievements(prev, next, unlocked)` reads one step, `prev` to `next`
(`next.events` are that step's events), and returns the ids it newly
earns that are not in the array `unlocked`, in `ACHIEVEMENTS` order. For
`full_hands` and `monochrome` it reads `prev.carried`.

## 22. Statistics (`src/core/stats.js`)

`statsInit()` returns `{ ticks: 0, moves: 0, pickups: 0, merges: 0,
patchesMerged: 0, bestMerge: 0, hits: 0, drops: 0, conflicts: 0, levels: 0
}`. `statsUpdate(stats, prev, next, input)` returns new stats for one step:
`ticks` grows by `next.tick - prev.tick`; `moves` by one when `input.move`
was given, a tick passed, and the player ended exactly one cell from where
it was; `pickups`, `merges`, `hits`, `drops`, and `conflicts` by the count
of those events; on a `merge`, `patchesMerged` by `prev.carried.length`
and `bestMerge` to at least it; `levels` by the count of `level` and `won`
events. `statsLines(stats)` returns `['MOVES <moves>', 'MERGES <merges>',
'BEST <bestMerge>', 'HITS <hits>', 'LEVELS <levels>']`.

## 23. Particles (`src/render/particles.js`)

Particles live in grid units (a cell's centre is `x + 0.5`, `y + 0.5`).
`PARTICLE_TTL` is 12. A particle is `{ x, y, vx, vy, ttl, color }`.

- `burst(x, y, color, count, seed)` returns `{ particles, seed }`: `count`
  particles at `(x, y)` with `ttl` `PARTICLE_TTL`, each from two draws of
  `rngNext`: an angle `a = value * 2 * Math.PI`, then a speed `v = 0.05 +
  value * 0.1`, so `vx = Math.cos(a) * v` and `vy = Math.sin(a) * v`.
- `stepParticles(particles)` returns them one tick on: `x += vx`, `y +=
  vy`, then `vy += 0.01`, `ttl` down by one, and those at `ttl` 0 gone.
- `particlesFor(state, seed)` returns `{ particles, seed }` for the state's
  events, in event order, each a burst at the player's cell centre:
  `pickup` 6 in the agent colour of the last carried patch, `merge` 12 in
  `PALETTE.accent`, `drop` and `hit` 10 in `PALETTE.danger`; and for
  `conflict`, 8 in `PALETTE.danger` at the centre of each conflict with
  `ttl` `CONFLICT_TICKS`. Other events make none.
- `particleOps(particles, layout)` returns one `circle` op of kind
  `particle` per particle at `layout.ox + x * layout.cell`, `layout.oy + y *
  layout.cell`, radius `Math.max(1, layout.cell / 12)`, in its colour.

## 24. Music (`src/audio/music.js`)

Background music is generated, never sampled. `SCALE` is the natural
minor, `[0, 2, 3, 5, 7, 8, 10]`, and `ROOT_HZ` is 220.
`noteHz(degree, octave)` is `ROOT_HZ * 2 ** ((SCALE[degree mod 7] + 12 *
(octave + Math.floor(degree / 7))) / 12)` (`octave` defaults to 0, and
`degree mod 7` is never negative). `tempo(levelIndex)` is `96 + 8 *
levelIndex` beats per minute, at most 160.

`bar(levelIndex, barIndex)` returns 8 steps, each `null` (a rest) or `{
degree, octave }` with `degree` 0 to 6 and `octave` -1 to 1: a pure
function of its arguments, a loop of 4 bars (`bar(l, b)` equals `bar(l, b
+ 4)`), at least 3 notes in every bar, and different levels sounding
different. `scheduleBar(ctx, steps, startTime, bpm, gain)` plays a bar on
an AudioContext: for each note at step `i`, one oscillator (`type`
`'triangle'`, `frequency.value` its `noteHz`) through one gain node (its
`gain.value` the given gain) to `ctx.destination`, started at `startTime +
i * 30 / bpm` and stopped at most `30 / bpm` seconds later; rests make
nothing.
