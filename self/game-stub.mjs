// A loadable substitute for src/core/game.js, for the replays self-test.
// It stubs the routing replay.js needs: init(seed, options) remembers the
// seed, level, and levels it was given; step(state, input) records one
// line per input step, mutating nothing.
export const CALLS = { init: [], step: [] };

export function init(seed, options = {}) {
  const state = {
    seed: seed >>> 0,
    level: options.level ?? null,
    levels: options.levels ?? null,
    player: { x: 0, y: 0 },
    log: [],
  };
  CALLS.init.push({ seed: state.seed, level: state.level, levels: state.levels });
  return state;
}

export function step(state, input) {
  CALLS.step.push({ from: state, input });
  return { ...state, log: [...state.log, input.move + (input.pause ? '!' : '')] };
}
