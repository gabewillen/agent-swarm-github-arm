// The renderer (DESIGN.md §11): drawList turns a state into a list of draw
// operations, a pure function; paint puts a list on a 2D canvas context.
// The look is flat squares, thin lines, and one yellow accent.

import { PALETTE } from './palette.js';

export const HUD_HEIGHT = 48;

// layout picks the cell size that fits the level in the view and the
// offset that centres the board under the HUD strip.
export function layout(level, view) {
  const cell = Math.floor(Math.min(
    view.width / level.width,
    (view.height - HUD_HEIGHT) / level.height,
  ));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

const at = ({ ox, oy, cell }, x, y) => ({
  x: ox + x * cell,
  y: oy + y * cell,
});

// The cell's centre, for things drawn inside a cell.
const centre = (geo, x, y) => ({
  x: geo.ox + x * geo.cell + geo.cell / 2,
  y: geo.oy + y * geo.cell + geo.cell / 2,
});

// drawList reads the state and returns ops, each with a kind:
//   rect: op, x, y, w, h, color - circle: op, x, y, r, color
//   text: op, x, y, text, color, size
export function drawList(state, view) {
  const level = state.level;
  const geo = layout(level, view);
  const ops = [];

  // 1. The background covers the whole view.
  ops.push({ op: 'rect', kind: 'bg', x: 0, y: 0, w: view.width, h: view.height, color: PALETTE.bg });

  // 2. One rect per wall cell.
  level.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') {
        const p = at(geo, x, y);
        ops.push({ op: 'rect', kind: 'wall', x: p.x, y: p.y, w: geo.cell, h: geo.cell, color: PALETTE.wall });
      }
    }
  });

  // 3. Merge pads, the exit, and the hold doors.
  level.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const p = at(geo, x, y);
      if (row[x] === 'M') {
        ops.push({ op: 'rect', kind: 'merge', x: p.x, y: p.y, w: geo.cell, h: geo.cell, color: PALETTE.panel });
      } else if (row[x] === 'X') {
        ops.push({ op: 'rect', kind: 'exit', x: p.x, y: p.y, w: geo.cell, h: geo.cell, color: state.open ? PALETTE.accent : PALETTE.dim });
      } else if (row[x] === 'H') {
        ops.push({ op: 'rect', kind: 'hold', x: p.x, y: p.y, w: geo.cell, h: geo.cell, color: state.open ? PALETTE.floor : PALETTE.dim });
      }
    }
  });

  // 4. Everything that lives on the floor: patches, drifts, conflicts,
  // and exactly one player, each inside its cell's square.
  for (const patch of state.patches ?? []) {
    const c = centre(geo, patch.x, patch.y);
    ops.push({ op: 'circle', kind: 'patch', x: c.x, y: c.y, r: geo.cell * 0.3, color: PALETTE.agents[patch.color] ?? PALETTE.text });
  }
  for (const drift of state.drifts ?? []) {
    const c = centre(geo, drift.x, drift.y);
    ops.push({ op: 'circle', kind: 'drift', x: c.x, y: c.y, r: geo.cell * 0.3, color: PALETTE.danger });
  }
  for (const conflict of state.conflicts ?? []) {
    const p = at(geo, conflict.x, conflict.y);
    const inset = geo.cell * 0.2;
    ops.push({ op: 'rect', kind: 'conflict', x: p.x + inset, y: p.y + inset, w: geo.cell - inset * 2, h: geo.cell - inset * 2, color: PALETTE.danger });
  }
  {
    const c = centre(geo, state.player.x, state.player.y);
    ops.push({ op: 'circle', kind: 'player', x: c.x, y: c.y, r: geo.cell * 0.38, color: PALETTE.accent });
  }

  // 5. The HUD strip: score, lives, and merges over quorum.
  const hudSize = 16;
  const texts = [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `${state.merges}/${level.quorum}`,
  ];
  texts.forEach((text, i) => {
    ops.push({ op: 'text', kind: 'hud', x: 8 + i * 160, y: 30, text, color: PALETTE.text, size: hudSize });
  });

  // 6. A banner over the board when the game stands still.
  if (state.paused) {
    ops.push({ op: 'text', kind: 'banner', x: 16, y: geo.oy + geo.cell, text: 'PAUSED', color: PALETTE.accent, size: 32 });
  } else if (state.status === 'won') {
    ops.push({ op: 'text', kind: 'banner', x: 16, y: geo.oy + geo.cell, text: 'ALL MERGED', color: PALETTE.accent, size: 32 });
  } else if (state.status === 'lost') {
    ops.push({ op: 'text', kind: 'banner', x: 16, y: geo.oy + geo.cell, text: 'GAME OVER', color: PALETTE.accent, size: 32 });
  }

  return ops;
}

// paint draws the list on a 2D context: fillStyle per op, then fillRect,
// arc + fill, or font + fillText.
export function paint(ctx, ops) {
  for (const o of ops) {
    ctx.fillStyle = o.color;
    if (o.op === 'rect') {
      ctx.fillRect(o.x, o.y, o.w, o.h);
    } else if (o.op === 'circle') {
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, 2 * Math.PI);
      ctx.fill();
    } else if (o.op === 'text') {
      ctx.font = `${o.size ?? 16}px monospace`;
      ctx.fillText(o.text, o.x, o.y);
    }
  }
}
