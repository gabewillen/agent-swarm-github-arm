// §11 — the canvas renderer. drawList turns a game state into a pure list
// of draw operations; paint copies such a list onto a 2D canvas context.
// The look is lvcs.sh's: near-black ground, one yellow accent, flat
// squares, no gradients. Every colour comes from the palette.
import { PALETTE } from './palette.js';

// A strip at the top of the canvas for the HUD.
export const HUD_HEIGHT = 48;

// Fits the level in the view under the HUD and centres it.
export function layout(level, view) {
  const cell = Math.floor(Math.min(
    view.width / level.width,
    (view.height - HUD_HEIGHT) / level.height,
  ));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

const rectOp = (kind, x, y, w, h, color) => ({ op: 'rect', kind, x, y, w, h, color });

// A square inset in the cell at (x, y): frac is the inner share of the cell.
const inner = (kind, x, y, cell, frac, color) => {
  const size = Math.max(1, Math.floor(cell * frac));
  const gap = Math.floor((cell - size) / 2);
  return rectOp(kind, x + gap, y + gap, size, size, color);
};

// A patch's colour, safe for a colour number outside [0, COLORS).
const agentColor = (color) => {
  const i = Number(color);
  return (Number.isInteger(i) && i >= 0 && i < PALETTE.agents.length)
    ? PALETTE.agents[i]
    : PALETTE.agents[0];
};

const asArray = (v) => (Array.isArray(v) ? v : []);

// HUD text mirrors ui/menu.js's hudText (§14): score, lives, merges, level.
const hudStrings = (state, level) => {
  const n = (v) => String(v ?? 0);
  return [
    { text: `SCORE ${n(state.score)}`, color: PALETTE.text },
    { text: `LIVES ${n(state.lives)}`, color: PALETTE.text },
    { text: `MERGES ${n(state.merges)}/${n(level.quorum)}`, color: state.open ? PALETTE.accent : PALETTE.text },
    { text: `LEVEL ${n((state.levelIndex ?? 0) + 1)}`, color: PALETTE.text },
  ];
};

// Pure: reads the state, reads the view, returns the draw operations.
// Terrain first, then the actors, then text, so later ops paint over
// earlier ones.
export function drawList(state, view) {
  const level = state.level || { width: 0, height: 0, tiles: [], quorum: 0 };
  const { cell, ox, oy } = layout(level, view);
  const cellX = (x) => ox + x * cell;
  const cellY = (y) => oy + y * cell;
  const ops = [];

  // The whole view, then the HUD strip above the board.
  ops.push(rectOp('bg', 0, 0, view.width, view.height, PALETTE.bg));
  ops.push(rectOp('hudstrip', 0, 0, view.width, HUD_HEIGHT, PALETTE.panel));

  // Terrain: one op per wall, merge pad, exit, and hold door, at its cell.
  const tiles = asArray(level.tiles);
  for (let y = 0; y < tiles.length; y++) {
    const row = tiles[y];
    for (let x = 0; x < row.length; x++) {
      const cx = cellX(x);
      const cy = cellY(y);
      if (row[x] === '#') ops.push(rectOp('wall', cx, cy, cell, cell, PALETTE.wall));
      else if (row[x] === 'M') ops.push(rectOp('merge', cx, cy, cell, cell, PALETTE.panel));
      else if (row[x] === 'X') ops.push(rectOp('exit', cx, cy, cell, cell, state.open ? PALETTE.accent : PALETTE.dim));
      else if (row[x] === 'H') ops.push(rectOp('hold', cx, cy, cell, cell, state.open ? PALETTE.floor : PALETTE.dim));
    }
  }

  // Actors: patches, drifts, conflicts, and the player, each inside its
  // cell's square. The player goes last so it is never hidden.
  for (const p of asArray(state.patches)) {
    ops.push(inner('patch', cellX(p.x), cellY(p.y), cell, 0.6, agentColor(p.color)));
  }
  for (const d of asArray(state.drifts)) {
    ops.push(inner('drift', cellX(d.x), cellY(d.y), cell, 0.75, PALETTE.danger));
  }
  for (const c of asArray(state.conflicts)) {
    ops.push(inner('conflict', cellX(c.x), cellY(c.y), cell, 0.9, PALETTE.danger));
  }
  const player = state.player || { x: 0, y: 0 };
  ops.push(inner('player', cellX(player.x), cellY(player.y), cell, 0.7, PALETTE.accent));

  // The HUD strip: score, lives, merges, level.
  const hudSize = Math.floor(Math.min(16, Math.max(10, view.width / 40)));
  const lines = hudStrings(state, level);
  const column = view.width / lines.length;
  lines.forEach((line, i) => {
    ops.push({ op: 'text', kind: 'hud', x: Math.floor(column * i + 10), y: HUD_HEIGHT - 15, text: line.text, color: line.color, size: hudSize });
  });

  // The banner above the board when the game is not being played.
  const banner = state.paused
    ? { text: 'PAUSED', color: PALETTE.text }
    : state.status === 'won'
      ? { text: 'ALL MERGED', color: PALETTE.accent }
      : state.status === 'lost'
        ? { text: 'GAME OVER', color: PALETTE.danger }
        : null;
  if (banner) {
    const size = Math.max(16, Math.floor(view.height / 16));
    const x = Math.floor((view.width - banner.text.length * size * 0.6) / 2);
    const y = oy + Math.floor((cell * level.height) / 2) + Math.floor(size / 3);
    ops.push({ op: 'text', kind: 'banner', x, y, text: banner.text, color: banner.color, size });
  }

  return ops;
}

// Draws the list on a 2D canvas context: one fillRect per rect, one
// beginPath/arc/fill per circle, one font and fillText per text.
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
