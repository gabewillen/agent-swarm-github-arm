// The canvas renderer (DESIGN.md §11). `drawList` turns a game state into a
// pure list of draw operations; `paint` plays that list on a 2D canvas
// context. Every colour comes from the palette.
import { PALETTE } from './palette.js';

// The strip at the top of the canvas that holds the HUD.
export const HUD_HEIGHT = 48;

// Geometry for a view of `view = { width, height }` pixels: square cells as
// large as fit under the HUD strip, centred in what is left of it.
export function layout(level, view) {
  const cell = Math.floor(
    Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height),
  );
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

const rect = (kind, x, y, w, h, color) => ({ op: 'rect', kind, x, y, w, h, color });
const circle = (kind, x, y, r, color) => ({ op: 'circle', kind, x, y, r, color });
const text = (kind, x, y, text_, color, size) => ({ op: 'text', kind, x, y, text: text_, color, size });

// A square inside its cell, shrunk by a fraction of the cell on each side.
const insetRect = (kind, px, py, cell, k, color) =>
  rect(kind, px + cell * k, py + cell * k, cell * (1 - 2 * k), cell * (1 - 2 * k), color);

export function drawList(state, view) {
  const level = state.level;
  const { cell, ox, oy } = layout(level, view);
  const px = (x) => ox + x * cell;
  const py = (y) => oy + y * cell;
  const ops = [];

  // 1. The ground: the whole view, then the arena's floor and the HUD strip.
  ops.push(rect('bg', 0, 0, view.width, view.height, PALETTE.bg));
  ops.push(rect('floor', ox, oy, cell * level.width, cell * level.height, PALETTE.floor));
  ops.push(rect('panel', 0, 0, view.width, HUD_HEIGHT, PALETTE.panel));

  // 2. Walls, one full-cell square each.
  level.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') ops.push(rect('wall', px(x), py(y), cell, cell, PALETTE.wall));
    }
  });

  // 3. Merge pads, the exit, and the hold doors.
  level.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const pxx = px(x);
      const pyy = py(y);
      if (row[x] === 'M') ops.push(insetRect('merge', pxx, pyy, cell, 0.2, PALETTE.wall));
      if (row[x] === 'X') {
        ops.push(insetRect('exit', pxx, pyy, cell, 0.25, state.open ? PALETTE.accent : PALETTE.dim));
      }
      if (row[x] === 'H') {
        ops.push(rect('hold', pxx, pyy, cell, cell, state.open ? PALETTE.floor : PALETTE.dim));
      }
    }
  });

  // 4. Patches, drifts, conflicts, and the player, each inside its cell.
  for (const p of state.patches) {
    ops.push(circle('patch', px(p.x) + cell / 2, py(p.y) + cell / 2, cell * 0.25, PALETTE.agents[p.color]));
  }
  for (const d of state.drifts) {
    ops.push(circle('drift', px(d.x) + cell / 2, py(d.y) + cell / 2, cell * 0.35, PALETTE.danger));
  }
  for (const c of state.conflicts) {
    ops.push(insetRect('conflict', px(c.x), py(c.y), cell, 0.1, PALETTE.danger));
  }
  ops.push(insetRect('player', px(state.player.x), py(state.player.y), cell, 0.12, PALETTE.accent));

  // 5. The HUD strip.
  const size = 16;
  ops.push(text('hud', 12, 30, `SCORE ${state.score}`, PALETTE.text, size));
  ops.push(text('hud', view.width * 0.3, 30, `LIVES ${state.lives}`, PALETTE.text, size));
  ops.push(text('hud', view.width * 0.5, 30, `MERGES ${state.merges}/${level.quorum}`, PALETTE.text, size));
  ops.push(text('hud', view.width * 0.72, 30, `LEVEL ${state.levelIndex + 1}`, PALETTE.dim, size));

  // 6. The banner over the arena: at most one of the three.
  const banner =
    state.status === 'won' ? 'ALL MERGED'
    : state.status === 'lost' ? 'GAME OVER'
    : state.paused ? 'PAUSED'
    : null;
  if (banner !== null) {
    const bSize = 24;
    const color = banner === 'ALL MERGED' ? PALETTE.accent : banner === 'GAME OVER' ? PALETTE.danger : PALETTE.text;
    const bx = Math.floor((view.width - banner.length * bSize * 0.6) / 2);
    const by = Math.floor(oy + (cell * level.height) / 2 + bSize * 0.35);
    ops.push(text('banner', bx, by, banner, color, bSize));
  }

  return ops;
}

// Draws the operations on a 2D canvas context: one fillRect per rect, one
// arc-plus-fill per circle, one font-plus-fillText per text.
export function paint(ctx, ops) {
  for (const o of ops) {
    ctx.fillStyle = o.color;
    if (o.op === 'rect') {
      ctx.fillRect(o.x, o.y, o.w, o.h);
    } else if (o.op === 'circle') {
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.op === 'text') {
      ctx.font = `${o.size}px monospace`;
      ctx.fillText(o.text, o.x, o.y);
    }
  }
}
