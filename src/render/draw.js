// The canvas renderer (DESIGN.md §11). `drawList` is pure and returns a
// list of draw operations; `paint` executes the list on a 2D context.
import { PALETTE } from './palette.js';

// A strip at the top of the canvas for the HUD.
export const HUD_HEIGHT = 48;

// { cell, ox, oy }: the cell size in pixels and where the board sits so it
// fits the view under the HUD strip and is centred.
export function layout(level, view) {
  const cell = Math.floor(
    Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height),
  );
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// One cell's rect op; `inset` shrinks entities inside their cell's square.
function cellRect(ops, kind, cx, cy, ox, oy, cell, inset, color) {
  ops.push({
    op: 'rect',
    kind,
    x: ox + cx * cell + inset,
    y: oy + cy * cell + inset,
    w: cell - 2 * inset,
    h: cell - 2 * inset,
    color,
  });
}

export function drawList(state, view) {
  const ops = [];
  const level = state.level;
  const { cell, ox, oy } = layout(level, view);

  // 1. A background op covering the whole view.
  ops.push({ op: 'rect', kind: 'bg', x: 0, y: 0, w: view.width, h: view.height, color: PALETTE.bg });

  // 2. One wall rect per wall cell, at its cell.
  const tiles = level.tiles;
  for (let y = 0; y < tiles.length; y++) {
    const row = tiles[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '#') {
        cellRect(ops, 'wall', x, y, ox, oy, cell, 0, PALETTE.wall);
      } else if (ch === 'M') {
        cellRect(ops, 'merge', x, y, ox, oy, cell, 0, PALETTE.accent);
      } else if (ch === 'X') {
        cellRect(ops, 'exit', x, y, ox, oy, cell, 0, state.open ? PALETTE.accent : PALETTE.dim);
      } else if (ch === 'H') {
        cellRect(ops, 'hold', x, y, ox, oy, cell, 0, state.open ? PALETTE.floor : PALETTE.dim);
      }
    }
  }

  // 4. Entities, each inside its cell's square: patches in their agent
  // colour, drifts and conflicts in danger, and the player in accent.
  const inset = (n) => (cell > n * 2 ? Math.floor(cell / n) : 2);
  for (const p of state.patches ?? []) {
    cellRect(ops, 'patch', p.x, p.y, ox, oy, cell, inset(6), PALETTE.agents[p.color]);
  }
  for (const d of state.drifts ?? []) {
    cellRect(ops, 'drift', d.x, d.y, ox, oy, cell, inset(4), PALETTE.danger);
  }
  for (const c of state.conflicts ?? []) {
    cellRect(ops, 'conflict', c.x, c.y, ox, oy, cell, inset(5), PALETTE.danger);
  }
  cellRect(ops, 'player', state.player.x, state.player.y, ox, oy, cell, inset(8), PALETTE.accent);

  // 5. The HUD strip's text: score, lives, and merges/quorum.
  const slot = Math.max(16, Math.floor((view.width - 32) / 4));
  const hud = [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `MERGES ${state.merges}/${level.quorum}`,
    `LEVEL ${state.levelIndex + 1}`,
  ];
  hud.forEach((text, i) => {
    ops.push({ op: 'text', kind: 'hud', x: 16 + i * slot, y: 32, text, color: PALETTE.text, size: 16 });
  });

  // 6. A banner over the board when paused, won, or lost.
  const banner = state.status === 'won' ? 'ALL MERGED'
    : state.status === 'lost' ? 'GAME OVER'
      : state.paused ? 'PAUSED' : null;
  if (banner) {
    ops.push({
      op: 'text',
      kind: 'banner',
      x: Math.floor((view.width - banner.length * 24 * 0.6) / 2),
      y: HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT) / 2) + 12,
      text: banner,
      color: PALETTE.text,
      size: 24,
    });
  }
  return ops;
}

// Draws the list on a 2D canvas context: fillStyle then fillRect for a
// rect, beginPath, arc, and fill for a circle, font and fillText for text.
export function paint(ctx, ops) {
  for (const o of ops) {
    if (o.op === 'rect') {
      ctx.fillStyle = o.color;
      ctx.fillRect(o.x, o.y, o.w, o.h);
    } else if (o.op === 'circle') {
      ctx.fillStyle = o.color;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.op === 'text') {
      ctx.fillStyle = o.color;
      ctx.font = `${o.size}px monospace`;
      ctx.fillText(o.text, o.x, o.y);
    }
  }
}
