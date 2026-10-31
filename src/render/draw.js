// Quorum Run — the canvas renderer (DESIGN.md §11).
// drawList is pure: it turns a game state into a list of flat draw
// operations, and paint applies that list to a 2D canvas context. Every
// colour comes from PALETTE, every shape is a square or a circle, and the
// text is drawn with a monospace font.
import { PALETTE } from './palette.js';

// Height in pixels of the HUD strip at the top of the canvas.
export const HUD_HEIGHT = 48;

// Where a level sits inside the view: one square per cell, centred below
// the HUD strip.
export function layout(level, view) {
  const cell = Math.floor(Math.min(
    view.width / level.width,
    (view.height - HUD_HEIGHT) / level.height,
  ));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// The draw operations for one frame, in painter's order: background, walls,
// terrain (merge pads, exit, holds), actors (patches, conflicts, drifts,
// player), HUD text, banner text.
export function drawList(state, view) {
  const ops = [];
  const level = state.level;
  const { cell, ox, oy } = layout(level, view);

  // 1. The background covers the whole view.
  ops.push({ op: 'rect', kind: 'bg', x: 0, y: 0, w: view.width, h: view.height, color: PALETTE.bg });

  // Helpers in cell coordinates.
  const sq = (x, y) => ({ x: ox + x * cell, y: oy + y * cell, w: cell, h: cell });
  const insetSq = (x, y, inset) => ({
    x: ox + x * cell + inset * cell,
    y: oy + y * cell + inset * cell,
    w: cell - 2 * inset * cell,
    h: cell - 2 * inset * cell,
  });
  const at = (x, y) => ({ x: ox + (x + 0.5) * cell, y: oy + (y + 0.5) * cell });

  // 2. One filled square per wall cell.
  const walls = [];
  const merges = [];
  const exits = [];
  const holds = [];
  for (let y = 0; y < level.tiles.length; y++) {
    const row = level.tiles[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '#') walls.push({ x, y });
      else if (ch === 'M') merges.push({ x, y });
      else if (ch === 'X') exits.push({ x, y });
      else if (ch === 'H') holds.push({ x, y });
    }
  }
  for (const w of walls) ops.push({ op: 'rect', kind: 'wall', ...sq(w.x, w.y), color: PALETTE.wall });
  for (const m of merges) {
    const r = insetSq(m.x, m.y, 0.25);
    ops.push({ op: 'rect', kind: 'merge', ...r, color: PALETTE.dim });
  }
  for (const e of exits) {
    ops.push({ op: 'rect', kind: 'exit', ...sq(e.x, e.y), color: state.open ? PALETTE.accent : PALETTE.dim });
  }
  for (const h of holds) {
    ops.push({ op: 'rect', kind: 'hold', ...sq(h.x, h.y), color: state.open ? PALETTE.floor : PALETTE.dim });
  }

  // 4. Actors.
  for (const p of state.patches) {
    const i = Number.isInteger(p.color) ? p.color : 0;
    ops.push({ op: 'circle', kind: 'patch', ...at(p.x, p.y), r: cell * 0.3, color: PALETTE.agents[i % PALETTE.agents.length] });
  }
  for (const c of state.conflicts) {
    const r = insetSq(c.x, c.y, 0.2);
    ops.push({ op: 'rect', kind: 'conflict', ...r, color: PALETTE.danger });
  }
  for (const d of state.drifts) {
    ops.push({ op: 'circle', kind: 'drift', ...at(d.x, d.y), r: cell * 0.35, color: PALETTE.danger });
  }
  ops.push({ op: 'circle', kind: 'player', ...at(state.player.x, state.player.y), r: cell * 0.35, color: PALETTE.accent });

  // 5. The HUD strip: score, lives, merges over quorum.
  ops.push({ op: 'text', kind: 'hud', x: 8, y: 30, text: `SCORE ${state.score}`, color: PALETTE.text, size: 16 });
  ops.push({ op: 'text', kind: 'hud', x: Math.floor(view.width * 0.33), y: 30, text: `LIVES ${state.lives}`, color: PALETTE.danger, size: 16 });
  ops.push({
    op: 'text', kind: 'hud', x: Math.floor(view.width * 0.66), y: 30,
    text: `${state.merges}/${level.quorum}`, color: state.open ? PALETTE.accent : PALETTE.text, size: 16,
  });

  // 6. The banner over the play field, only when the game is stopped.
  const banner = state.status === 'won' ? 'ALL MERGED'
    : state.status === 'lost' ? 'GAME OVER'
      : state.paused ? 'PAUSED' : null;
  if (banner) {
    const color = banner === 'ALL MERGED' ? PALETTE.accent : banner === 'GAME OVER' ? PALETTE.danger : PALETTE.text;
    ops.push({
      op: 'text', kind: 'banner',
      x: Math.floor(ox + (level.width * cell) / 2), y: Math.floor(oy + (level.height * cell) / 2),
      text: banner, color, size: 24,
    });
  }

  return ops;
}

// Draws the list on a 2D canvas context, in order: fillStyle from the op,
// then fillRect, arc+fill, or font+fillText.
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
