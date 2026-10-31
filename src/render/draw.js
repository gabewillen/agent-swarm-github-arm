// The canvas renderer (DESIGN.md §11). `drawList` is pure: it turns a game
// state into a flat list of draw operations, and `paint` blits that list
// onto a 2D canvas context. The look is lvcs.sh's: a near-black ground, one
// yellow accent, four agent colours, flat squares and thin lines.

import { PALETTE } from './palette.js';

// The HUD strip at the top of the canvas, in pixels.
export const HUD_HEIGHT = 48;

// The playfield fits under the HUD strip, centres in what is left.
export function layout(level, view) {
  const cell = Math.floor(Math.min(
    view.width / level.width,
    (view.height - HUD_HEIGHT) / level.height,
  ));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// Builds the full draw list for a state and a view `{ width, height }`.
// Reads the state only; every op is a fresh plain object.
export function drawList(state, view) {
  const ops = [];
  const level = state.level;
  const { cell, ox, oy } = layout(level, view);
  const px = (cx) => ox + cx * cell;
  const py = (cy) => oy + cy * cell;

  const rect = (kind, x, y, w, h, color) => ({ op: 'rect', kind, x, y, w, h, color });
  // A square inset inside a cell's square, by a fraction of the cell on
  // every side.
  const inset = (cx, cy, f) => {
    const x = px(cx) + Math.round(cell * f);
    const y = py(cy) + Math.round(cell * f);
    const s = cell - Math.round(cell * f) * 2;
    return { x, y, s };
  };

  ops.push(rect('bg', 0, 0, view.width, view.height, PALETTE.bg));
  // The HUD strip and the thin line that divides it from the ground.
  ops.push(rect('panel', 0, 0, view.width, HUD_HEIGHT, PALETTE.panel));
  ops.push(rect('hairline', 0, HUD_HEIGHT - 2, view.width, 2, PALETTE.wall));

  // The map: a floor tile under every passable cell, a wall block on
  // every `#`, and where the pads, exit, and hold doors sit.
  const pads = [];
  const holds = [];
  let exit = null;
  level.tiles.forEach((row, cy) => {
    for (let cx = 0; cx < row.length; cx++) {
      const ch = row[cx];
      if (ch === '#') ops.push(rect('wall', px(cx), py(cy), cell, cell, PALETTE.wall));
      else ops.push(rect('floor', px(cx), py(cy), cell, cell, PALETTE.floor));
      if (ch === 'M') pads.push({ cx, cy });
      else if (ch === 'H') holds.push({ cx, cy });
      else if (ch === 'X') exit = { cx, cy };
    }
  });

  // Merge pads: small accent sockets waiting for patches.
  for (const pad of pads) {
    const { x, y, s } = inset(pad.cx, pad.cy, 0.3);
    ops.push(rect('merge', x, y, s, s, PALETTE.accent));
  }
  // The exit: a full accent doorway while the quorum holds, a smaller dim
  // marker when it is sealed (so a closed hold never looks like it).
  if (exit) {
    const { x, y, s } = inset(exit.cx, exit.cy, state.open ? 0 : 0.25);
    ops.push(rect('exit', x, y, s, s, state.open ? PALETTE.accent : PALETTE.dim));
  }
  // Hold doors: dim blocks until open, then they look like floor.
  for (const hold of holds) {
    ops.push(rect('hold', px(hold.cx), py(hold.cy), cell, cell, state.open ? PALETTE.floor : PALETTE.dim));
  }

  // Lying patches, in their agent colour.
  for (const patch of state.patches || []) {
    const { x, y, s } = inset(patch.x, patch.y, 0.25);
    ops.push(rect('patch', x, y, s, s, PALETTE.agents[patch.color] ?? PALETTE.dim));
  }

  // Drifts: the patrolling dangers.
  for (const drift of state.drifts || []) {
    const { x, y, s } = inset(drift.x, drift.y, 0.15);
    ops.push(rect('drift', x, y, s, s, PALETTE.danger));
  }

  // Conflicts: full-cell blocks nobody passes.
  for (const conflict of state.conflicts || []) {
    ops.push(rect('conflict', px(conflict.x), py(conflict.y), cell, cell, PALETTE.danger));
  }

  // The player: the largest square in the accent colour.
  if (state.player) {
    const { x, y, s } = inset(state.player.x, state.player.y, 0.1);
    ops.push(rect('player', x, y, s, s, PALETTE.accent));
    // What the player carries, held along the top of its cell.
    const carried = state.carried || [];
    const n = carried.length;
    if (n > 0) {
      const size = Math.max(2, Math.round(cell * 0.16));
      const gap = Math.round(cell * 0.06);
      let x = px(state.player.x) + Math.round((cell - (n * size + (n - 1) * gap)) / 2);
      const y = py(state.player.y) + Math.round(cell * 0.1);
      for (const color of carried) {
        ops.push(rect('carry', x, y, size, size, PALETTE.agents[color] ?? PALETTE.dim));
        x += size + gap;
      }
    }
  }

  // The HUD: left-packed across the strip, in reading order.
  let hx = 12;
  const hud = (text, color) => {
    ops.push({ op: 'text', kind: 'hud', x: Math.round(hx), y: 30, text, color, size: 16 });
    hx += text.length * 9.6 + 24;
  };
  hud(`SCORE ${state.score}`, PALETTE.text);
  hud(`LIVES ${state.lives}`, state.lives <= 1 ? PALETTE.danger : PALETTE.text);
  hud(`${state.merges}/${level.quorum}`, state.open ? PALETTE.accent : PALETTE.text);
  hud(`LEVEL ${state.levelIndex + 1}`, PALETTE.dim);

  // The banner: one line about the run, only when it matters.
  let banner = null;
  if (state.paused) banner = { text: 'PAUSED', color: PALETTE.text };
  else if (state.status === 'won') banner = { text: 'ALL MERGED', color: PALETTE.accent };
  else if (state.status === 'lost') banner = { text: 'GAME OVER', color: PALETTE.danger };
  if (banner) {
    ops.push({
      op: 'text', kind: 'banner',
      x: Math.round((view.width - banner.text.length * 14.4) / 2),
      y: Math.round(view.height / 2) - 12,
      text: banner.text, color: banner.color, size: 24,
    });
  }

  return ops;
}

// Blits the ops onto a 2D canvas context. Only fills: flat squares, flat
// circles (particles), and text.
export function paint(ctx, ops) {
  for (const op of ops) {
    if (!op) continue;
    ctx.fillStyle = op.color;
    if (op.op === 'rect') {
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.op === 'circle') {
      ctx.beginPath();
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (op.op === 'text') {
      ctx.font = `${op.size ?? 16}px monospace`;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}
