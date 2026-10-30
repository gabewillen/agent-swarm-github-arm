# Quorum Run

A small arcade puzzle game for the browser, built from an empty repository.
You are a courier agent: pick up patches, merge them on a merge pad until the
level's quorum lands, then ship the level through the exit while drifts patrol
the grid. Plain ES modules, no build step, no dependencies.

- `DESIGN.md` is the game's design and the contract every module is built to.
- `tests/` holds the acceptance tests. `node tests/run.mjs` runs them all and
  prints the score per section and overall (`passed N/M`);
  `node tests/run.mjs 05 09` runs only the sections whose names hold 05 or 09.
- `src/` holds the game (see DESIGN.md §1 for its modules).

## Play

Serve the directory and open `index.html`:

```sh
npm run serve   # then http://localhost:8080
```

Arrow keys or WASD move, P pauses, Enter selects.
