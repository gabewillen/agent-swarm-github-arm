// The canvas renderer (DESIGN.md §11). drawList is pure: it turns a game
// state and a view size into a flat list of draw operations, and paint puts
// such a list on a 2D canvas context. The look is flat squares, thin lines,
// palette colours only.

import { PALETTE } from './palette.js';

// A strip at the top of the canvas for the HUD (score, lives, merge count).
export const HUD_HEIGHT = 48;

// Where the level sits inside the view: the cell size in pixels and the
// offsets that centre the grid under the HUD strip.
export function layout(level, view) {
  const cell = Math.floor(Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

const agents = (color) => PALETTE.agents[color] ?? PALETTE.accent;

// A square (or square centre) inset `f` of the cell size at cell (cx, cy).
function squareAt(ox, oy, cell, x, y, f) {
  const inset = cell * f;
  return [Math.floor(ox + x * cell + inset), Math.floor(oy + y * cell + inset), cell - inset * 2];
}

// One text op; with `left` false, x is a centre measured against a
// monospace font of that size, so text can be centred without a canvas.
function textOp(kind, x, y, text, color, size, left) {
  const tx = left ? Math.floor(x) : Math.floor(x - (text.length * size * 0.6) / 2);
  return { op: 'text', kind, x: tx, y, text, color, size };
}

// The full draw list for a state, in paint order.
export function drawList(state, view) {
  const level = state.level;
  const width = view.width;
  const height = view.height;
  const { cell, ox, oy } = layout(level, view);
  const ops = [];

  // 1. The background covers the whole view.
  ops.push({ op: 'rect', kind: 'bg', x: 0, y: 0, w: width, h: height, color: PALETTE.bg });
  // The HUD strip above the play area.
  ops.push({ op: 'rect', kind: 'hudbg', x: 0, y: 0, w: width, h: HUD_HEIGHT, color: PALETTE.panel });

  // 2 and 3. Terrain: one rect per wall cell, and one op per merge pad, the
  // exit, and every hold door.
  for (let y = 0; y < level.tiles.length; y++) {
    const row = level.tiles[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '#') {
        ops.push({ op: 'rect', kind: 'wall', x: ox + x * cell, y: oy + y * cell, w: cell, h: cell, color: PALETTE.wall });
      } else if (ch === 'M') {
        ops.push({ op: 'rect', kind: 'merge', x: ox + x * cell, y: oy + y * cell, w: cell, h: cell, color: PALETTE.panel });
        const [mx, my, ms] = squareAt(ox, oy, cell, x, y, 0.3);
        ops.push({ op: 'rect', kind: 'mergepad', x: mx, y: my, w: ms, h: ms, color: PALETTE.accent });
      } else if (ch === 'X') {
        ops.push({ op: 'rect', kind: 'exit', x: ox + x * cell, y: oy + y * cell, w: cell, h: cell, color: state.open ? PALETTE.accent : PALETTE.dim });
      } else if (ch === 'H') {
        ops.push({ op: 'rect', kind: 'hold', x: ox + x * cell, y: oy + y * cell, w: cell, h: cell, color: state.open ? PALETTE.floor : PALETTE.dim });
      }
    }
  }

  // 4. The things in the grid: lying patches, drifts, conflicts, the player.
  for (const p of state.patches ?? []) {
    const [px, py, ps] = squareAt(ox, oy, cell, p.x, p.y, 0.28);
    ops.push({ op: 'rect', kind: 'patch', x: px, y: py, w: ps, h: ps, color: agents(p.color) });
  }
  for (const d of state.drifts ?? []) {
    ops.push({
      op: 'circle', kind: 'drift',
      x: ox + (d.x + 0.5) * cell, y: oy + (d.y + 0.5) * cell, r: cell * 0.3,
      color: PALETTE.danger,
    });
  }
  for (const c of state.conflicts ?? []) {
    ops.push({ op: 'rect', kind: 'conflict', x: ox + c.x * cell, y: oy + c.y * cell, w: cell, h: cell, color: PALETTE.danger });
  }
  {
    const [qx, qy, qs] = squareAt(ox, oy, cell, state.player.x, state.player.y, 0.16);
    ops.push({ op: 'rect', kind: 'player', x: qx, y: qy, w: qs, h: qs, color: PALETTE.accent });
    if (state.invuln > 0) {
      // A thin shell while the courier can't be hit again.
      ops.push({ op: 'rect', kind: 'shell', x: qx - cell * 0.08, y: qy - cell * 0.08, w: qs + cell * 0.16, h: qs + cell * 0.16, color: PALETTE.text });
    }
  }

  // 5. The HUD: score, lives, merges against the quorum, and the level.
  const size = 16;
  const hudY = Math.floor(HUD_HEIGHT / 2 + size / 3);
  ops.push(textOp('hud', 12, hudY, `SCORE ${state.score}`, PALETTE.text, size, true));
  ops.push(textOp('hud', 180, hudY, `LIVES ${state.lives}`, PALETTE.text, size, true));
  const merges = `${state.merges}/${state.level.quorum}`;
  ops.push(textOp('hud', 320, hudY, merges, PALETTE.accent, size, true));
  ops.push(textOp('hud', width - 12 - 7 * size * 0.6, hudY, `LEVEL ${(state.levelIndex ?? 0) + 1}`, PALETTE.dim, size, true));

  // 6. The banner: paused, won, or lost.
  const banner = state.paused ? 'PAUSED' : state.status === 'won' ? 'ALL MERGED' : state.status === 'lost' ? 'GAME OVER' : null;
  if (banner) {
    ops.push(textOp('banner', width / 2, Math.floor(height * 0.55), banner, PALETTE.accent, 28));
  }

  return ops;
}

// Draw the list on a 2D canvas context, one op at a time.
export function paint(ctx, ops) {
  for (const op of ops) {
    ctx.fillStyle = op.color;
    if (op.op === 'rect') {
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.op === 'circle') {
      ctx.beginPath();
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (op.op === 'text') {
      ctx.font = `${op.size}px monospace`;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}
