// The canvas renderer (DESIGN.md §11): drawList turns a state into a
// list of flat draw operations; paint draws the list on any 2D context.

import { PALETTE } from './palette.js';

// The HUD strip runs across the top of the canvas.
export const HUD_HEIGHT = 48;

// layout(level, view) -> { cell, ox, oy }: the square cell size that
// fits the level under the HUD, and the origin that centres it.
export function layout(level, view) {
  const cell = Math.floor(Math.min(
    view.width / level.width,
    (view.height - HUD_HEIGHT) / level.height,
  ));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// drawList(state, view) is pure and returns one draw operation per thing
// on the screen, each with a `kind` and a colour from PALETTE.
export function drawList(state, view) {
  const { cell, ox, oy } = layout(state.level, view);
  const atX = (x) => ox + x * cell;
  const atY = (y) => oy + y * cell;
  const ops = [];

  ops.push({ op: 'rect', kind: 'bg', x: 0, y: 0, w: view.width, h: view.height, color: PALETTE.bg });

  // Terrain: walls, merge pads, the exit, hold doors.
  state.level.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '#') {
        ops.push({ op: 'rect', kind: 'wall', x: atX(x), y: atY(y), w: cell, h: cell, color: PALETTE.wall });
      } else if (ch === 'M') {
        ops.push({ op: 'rect', kind: 'merge', x: atX(x), y: atY(y), w: cell, h: cell, color: PALETTE.panel });
      } else if (ch === 'X') {
        ops.push({ op: 'rect', kind: 'exit', x: atX(x), y: atY(y), w: cell, h: cell, color: state.open ? PALETTE.accent : PALETTE.dim });
      } else if (ch === 'H') {
        ops.push({ op: 'rect', kind: 'hold', x: atX(x), y: atY(y), w: cell, h: cell, color: state.open ? PALETTE.floor : PALETTE.dim });
      }
    }
  });

  // Conflicts under everything else on their cells.
  for (const c of state.conflicts) {
    ops.push({ op: 'circle', kind: 'conflict', x: atX(c.x) + cell / 2, y: atY(c.y) + cell / 2, r: Math.max(3, cell / 2.5), color: PALETTE.danger });
  }

  // Patches and drifts.
  for (const p of state.patches) {
    const color = Number.isInteger(p.color) ? PALETTE.agents[p.color] : PALETTE.dim;
    ops.push({ op: 'circle', kind: 'patch', x: atX(p.x) + cell / 2, y: atY(p.y) + cell / 2, r: Math.max(2, cell / 6), color });
  }
  for (const d of state.drifts) {
    ops.push({ op: 'circle', kind: 'drift', x: atX(d.x) + cell / 2, y: atY(d.y) + cell / 2, r: Math.max(3, cell / 3), color: PALETTE.danger });
  }

  // The player on top.
  ops.push({
    op: 'circle', kind: 'player',
    x: atX(state.player.x) + cell / 2, y: atY(state.player.y) + cell / 2,
    r: Math.max(3, cell / 3), color: PALETTE.accent,
  });

  // The HUD strip.
  const hud = [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `MERGES ${state.merges}/${state.level.quorum}`,
    `LEVEL ${state.levelIndex + 1}`,
  ];
  hud.forEach((text, i) => {
    ops.push({ op: 'text', kind: 'hud', x: 8, y: 18 + i * 20, text, color: PALETTE.text, size: 14 });
  });

  // A banner over everything when the game is paused, won, or lost.
  let banner = null;
  if (state.paused) banner = 'PAUSED';
  else if (state.status === 'won') banner = 'ALL MERGED';
  else if (state.status === 'lost') banner = 'GAME OVER';
  if (banner !== null) {
    ops.push({
      op: 'text', kind: 'banner', x: Math.floor(view.width / 2 - banner.length * 9),
      y: Math.floor(view.height / 2), text: banner, color: PALETTE.accent, size: 32,
    });
  }

  return ops;
}

// paint(ctx, ops) draws the list on a 2D canvas context.
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
