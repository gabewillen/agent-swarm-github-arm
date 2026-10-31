// Quorum Run §11: the canvas renderer. `drawList(state, view)` is pure and
// returns one frame's draw operations; `paint(ctx, ops)` puts the list on
// a 2D canvas context. The look is flat squares, thin shapes, and text on
// a near-black ground, in the colours of palette.js only.
import { PALETTE } from './palette.js';

// The strip at the top of the canvas that holds the HUD.
export const HUD_HEIGHT = 48;

// Where the level sits inside the view: the cell size and the offsets
// that centre it below the HUD strip.
export function layout(level, view) {
  const cell = Math.floor(Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// The cell's top-left corner in view coordinates.
const corner = (ox, oy, cell, cx, cy) => [ox + cx * cell, oy + cy * cell];

// The cell's centre in view coordinates.
const centre = (ox, oy, cell, cx, cy) => [ox + (cx + 0.5) * cell, oy + (cy + 0.5) * cell];

// An inset square filling a fraction of a cell, used for markers that
// should not cover the cell's whole ground.
const inset = (ox, oy, cell, cx, cy, f) => ({
  x: ox + (cx + f / 2) * cell,
  y: oy + (cy + f / 2) * cell,
  w: cell * (1 - f),
  h: cell * (1 - f),
});

// One frame's draw operations for a state, in z order: background, HUD
// strip, board cells, markers, entities, HUD text and banners on top.
export function drawList(state, view) {
  const ops = [];
  const level = state.level;
  const { cell, ox, oy } = layout(level, view);

  // 1. The background covers the whole view.
  ops.push({ op: 'rect', kind: 'bg', x: 0, y: 0, w: view.width, h: view.height, color: PALETTE.bg });

  // The HUD strip sits between the browser and the board.
  ops.push({ op: 'rect', kind: 'panel', x: 0, y: 0, w: view.width, h: HUD_HEIGHT, color: PALETTE.panel });

  // The ground: a floor square under every cell that is not a wall.
  for (let cy = 0; cy < level.height; cy++) {
    const row = level.tiles[cy] || '';
    for (let cx = 0; cx < level.width; cx++) {
      const tile = row[cx];
      if (tile === '#') continue;
      if (tile === undefined) continue;
      const [x, y] = corner(ox, oy, cell, cx, cy);
      ops.push({ op: 'rect', kind: 'floor', x, y, w: cell, h: cell, color: PALETTE.floor });
    }
  }

  // Walls are the darker squares that bound the board.
  for (let cy = 0; cy < level.height; cy++) {
    const row = level.tiles[cy] || '';
    for (let cx = 0; cx < level.width; cx++) {
      const tile = row[cx];
      if (tile !== '#') continue;
      const [x, y] = corner(ox, oy, cell, cx, cy);
      ops.push({ op: 'rect', kind: 'wall', x, y, w: cell, h: cell, color: PALETTE.wall });
    }
  }

  // Merge pads, the exit, and hold doors: the fixed landmarks.
  for (let cy = 0; cy < level.height; cy++) {
    const row = level.tiles[cy] || '';
    for (let cx = 0; cx < level.width; cx++) {
      const tile = row[cx];
      if (tile === 'M') {
        ops.push({ op: 'rect', kind: 'merge', ...inset(ox, oy, cell, cx, cy, 0.25), color: PALETTE.dim });
      } else if (tile === 'X') {
        const [x, y] = corner(ox, oy, cell, cx, cy);
        ops.push({ op: 'rect', kind: 'exit', x, y, w: cell, h: cell, color: state.open ? PALETTE.accent : PALETTE.dim });
      } else if (tile === 'H') {
        ops.push({ op: 'rect', kind: 'hold', ...inset(ox, oy, cell, cx, cy, 0.35), color: state.open ? PALETTE.floor : PALETTE.dim });
      }
    }
  }

  // Conflicts: hazard blocks nobody can pass.
  for (const c of state.conflicts || []) {
    ops.push({ op: 'rect', kind: 'conflict', ...inset(ox, oy, cell, c.x, c.y, 0.2), color: PALETTE.danger });
  }

  // Lying patches, small squares in their agent colour.
  for (const p of state.patches || []) {
    const [x, y] = centre(ox, oy, cell, p.x, p.y);
    ops.push({ op: 'circle', kind: 'patch', x, y, r: cell * 0.34, color: PALETTE.agents[p.color] || PALETTE.dim });
  }

  // Drifts, the patrolling hazards.
  for (const d of state.drifts || []) {
    const [x, y] = centre(ox, oy, cell, d.x, d.y);
    ops.push({ op: 'circle', kind: 'drift', x, y, r: cell * 0.42, color: PALETTE.danger });
  }

  // The player, the courier in the accent colour.
  ops.push({
    op: 'rect', kind: 'player',
    ...inset(ox, oy, cell, state.player.x, state.player.y, 0.12),
    color: PALETTE.accent,
  });

  // Carried patches, drawn left to right in pickup order at the HUD's
  // right end, in the same agent colours as the lying patches.
  const carried = state.carried || [];
  for (let i = 0; i < carried.length; i++) {
    ops.push({
      op: 'circle', kind: 'carried',
      x: view.width - 20 - (carried.length - 1 - i) * 18,
      y: 24, r: 6,
      color: PALETTE.agents[carried[i]] || PALETTE.dim,
    });
  }

  // 5. The HUD text: score, lives, merges against quorum, level.
  const hudParts = [
    [`SCORE ${state.score}`, 16, PALETTE.text],
    [`LIVES ${state.lives}`, Math.round(view.width * 0.3), state.lives <= 1 ? PALETTE.danger : PALETTE.text],
    [`MERGES ${state.merges}/${level.quorum}`, Math.round(view.width * 0.52), PALETTE.text],
    [`LEVEL ${state.levelIndex + 1}`, Math.round(view.width * 0.74), PALETTE.dim],
  ];
  for (const [text, x, color] of hudParts) {
    ops.push({ op: 'text', kind: 'hud', x, y: 31, text, color, size: 16 });
  }

  // 6. The banner over the board: paused, won, or lost reads at a glance,
  // one text op, nothing while playing.
  const banner = state.paused ? 'PAUSED'
    : state.status === 'won' ? 'ALL MERGED'
      : state.status === 'lost' ? 'GAME OVER'
        : null;
  if (banner) {
    const size = 24;
    ops.push({
      op: 'text', kind: 'banner',
      x: Math.round((view.width - banner.length * size * 0.6) / 2),
      y: oy + Math.round((cell * level.height) / 2),
      text: banner,
      color: banner === 'GAME OVER' ? PALETTE.danger : PALETTE.accent,
      size,
    });
  }

  return ops;
}

// Paints a draw list on a 2D canvas context: fillStyle from the op, then
// fillRect, arc plus fill, or font plus fillText per shape.
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
      ctx.font = `${o.size}px ui-monospace, monospace`;
      ctx.fillText(o.text, o.x, o.y);
    }
  }
}
