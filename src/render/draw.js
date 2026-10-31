// src/render/draw.js — the canvas renderer (DESIGN.md §11).
//
// drawList is pure: it reads a game state and a view and returns plain
// draw operations (each with a `kind`), and paint is the only place that
// touches a canvas, through the context it is given. Every colour comes
// from the palette.
import { PALETTE } from './palette.js';

export const HUD_HEIGHT = 48;

// Pixel geometry of a level in a view: the square cell size and the
// top-left corner of the level's top-left cell.
export function layout(level, view) {
  const cell = Math.floor(Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

const agentColor = (list, i) => list[i] || PALETTE.dim;

// ops helpers keep every operation to exactly its shape's keys.
function rect(ops, kind, x, y, w, h, color) {
  ops.push({ op: 'rect', kind, x, y, w, h, color });
}

function circle(ops, kind, x, y, r, color) {
  ops.push({ op: 'circle', kind, x, y, r, color });
}

function text(ops, kind, x, y, textString, color, size) {
  ops.push({ op: 'text', kind, x, y, text: textString, color, size });
}

const cellRect = (ox, oy, cell, x, y) => ({ x: ox + x * cell, y: oy + y * cell });

const cellCentre = (ox, oy, cell, x, y) => ({ x: ox + (x + 0.5) * cell, y: oy + (y + 0.5) * cell });

// The draw list of one state in one view, in paint order:
// ground, HUD strip, terrain, things on the floor, the HUD text, and any
// banner over it all.
export function drawList(state, view) {
  const { cell, ox, oy } = layout(state.level, view);
  const W = view.width;
  const H = view.height;
  const ops = [];

  rect(ops, 'bg', 0, 0, W, H, PALETTE.bg);
  rect(ops, 'hudbg', 0, 0, W, HUD_HEIGHT, PALETTE.panel);
  rect(ops, 'hudline', 0, HUD_HEIGHT - 1, W, 1, PALETTE.dim);

  // Terrain: a wall block per wall cell, a small plate per merge pad, the
  // exit, and each hold door (with its closed/open colour).
  const tiles = state.level.tiles;
  for (let cy = 0; cy < tiles.length; cy++) {
    const row = tiles[cy];
    for (let cx = 0; cx < row.length; cx++) {
      const ch = row[cx];
      if (ch === '#') {
        const at = cellRect(ox, oy, cell, cx, cy);
        rect(ops, 'wall', at.x, at.y, cell, cell, PALETTE.wall);
      } else if (ch === 'M') {
        const pad = Math.max(4, Math.round(cell * 0.2));
        const at = cellRect(ox, oy, cell, cx, cy);
        rect(ops, 'merge', at.x + pad, at.y + pad, cell - pad * 2, cell - pad * 2, PALETTE.dim);
      } else if (ch === 'X') {
        const at = cellRect(ox, oy, cell, cx, cy);
        rect(ops, 'exit', at.x, at.y, cell, cell, state.open ? PALETTE.accent : PALETTE.dim);
      } else if (ch === 'H') {
        const at = cellRect(ox, oy, cell, cx, cy);
        rect(ops, 'hold', at.x + 2, at.y + 2, cell - 4, cell - 4, state.open ? PALETTE.floor : PALETTE.dim);
      }
    }
  }

  // The things on the floor: lying patches in their agent colour, drifts
  // and conflicts in the danger colour.
  for (const patch of state.patches || []) {
    const at = cellCentre(ox, oy, cell, patch.x, patch.y);
    circle(ops, 'patch', at.x, at.y, Math.max(2, Math.round(cell * 0.28)), agentColor(PALETTE.agents, patch.color));
  }
  for (const drift of state.drifts || []) {
    const at = cellCentre(ox, oy, cell, drift.x, drift.y);
    circle(ops, 'drift', at.x, at.y, Math.max(2, Math.round(cell * 0.3)), PALETTE.danger);
  }
  for (const conflict of state.conflicts || []) {
    const at = cellRect(ox, oy, cell, conflict.x, conflict.y);
    rect(ops, 'conflict', at.x, at.y, cell, cell, PALETTE.danger);
  }

  // The player: one accent roundel in its cell, with the carried patches
  // read off as small dots along its bottom edge.
  const player = state.player;
  if (player) {
    const at = cellCentre(ox, oy, cell, player.x, player.y);
    circle(ops, 'player', at.x, at.y, Math.max(3, Math.round(cell * 0.34)), PALETTE.accent);
    const carried = state.carried || [];
    const r = Math.max(1, Math.round(cell * 0.12));
    carried.forEach((color, i) => {
      const dx = (i - (carried.length - 1) / 2) * cell * 0.3;
      circle(ops, 'carry', at.x + dx, at.y + cell * 0.32, r, agentColor(PALETTE.agents, color));
    });
  }

  // The HUD strip: score, lives, the merges over the quorum, and the level.
  const size = 16;
  const baseline = 30;
  text(ops, 'hud', 12, baseline, `SCORE ${state.score}`, PALETTE.text, size);
  text(ops, 'hud', Math.round(W * 0.3), baseline, `LIVES ${state.lives}`, state.lives <= 1 ? PALETTE.danger : PALETTE.text, size);
  text(ops, 'hud', Math.round(W * 0.52), baseline, `${state.merges}/${state.level.quorum}`, state.open ? PALETTE.accent : PALETTE.dim, size);
  text(ops, 'hud', Math.round(W * 0.72), baseline, `LEVEL ${(state.levelIndex || 0) + 1}`, PALETTE.dim, size);

  // A banner over the play area when paused, won, or lost.
  const banner = state.paused ? 'PAUSED' : state.status === 'won' ? 'ALL MERGED' : state.status === 'lost' ? 'GAME OVER' : null;
  if (banner) {
    const big = Math.max(18, Math.min(48, Math.floor(W / 16)));
    const boxW = Math.round(big * 0.62 * banner.length) + 24;
    const boxH = big + 16;
    const bx = Math.round((W - boxW) / 2);
    const by = HUD_HEIGHT + Math.round((H - HUD_HEIGHT - boxH) / 2);
    rect(ops, 'bannerline', bx - 1, by - 1, boxW + 2, boxH + 2, PALETTE.dim);
    rect(ops, 'bannerbox', bx, by, boxW, boxH, PALETTE.panel);
    text(ops, 'banner', bx + 12, by + Math.round(boxH / 2 + big * 0.35), banner, PALETTE.text, big);
  }

  return ops;
}

// The one place a canvas is touched: draw the list on the given context.
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
