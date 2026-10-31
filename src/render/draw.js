// The canvas renderer (DESIGN.md §11). drawList is pure: it turns a game
// state and a view size into a list of draw operations that paint puts on
// a 2D context. Colours come only from the palette.
import { PALETTE } from './palette.js';

// The HUD is a strip across the top of the canvas.
export const HUD_HEIGHT = 48;

// Where the level lands in the view: `cell` pixels per grid cell, with the
// board centred below the HUD strip.
export function layout(level, view) {
  const cell = Math.floor(Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

function rect(kind, x, y, w, h, color) {
  return { op: 'rect', kind, x, y, w, h, color };
}

function circle(kind, x, y, r, color) {
  return { op: 'circle', kind, x, y, r, color };
}

function text(kind, x, y, text, color, size) {
  return { op: 'text', kind, x, y, text, color, size };
}

// A sub-square of the cell, so pads and hazards read differently from walls.
function insetRect(kind, x, y, cell, inset, color) {
  return rect(kind, x + cell * inset, y + cell * inset, cell * (1 - inset * 2), cell * (1 - inset * 2), color);
}

// Carried and lying patch colours are ints in [0, COLORS); fall back to the
// first agent colour on anything odd rather than drawing undefined.
function agentColor(color) {
  if (!Number.isInteger(color)) return PALETTE.agents[0];
  const n = ((color % PALETTE.agents.length) + PALETTE.agents.length) % PALETTE.agents.length;
  return PALETTE.agents[n];
}

// The draw list for a state, in paint order: background, walls, level
// furniture, entities (patches, conflicts, drifts, then the player on top),
// the HUD, and a banner when the game is not running.
export function drawList(state, view) {
  const level = state && state.level ? state.level : { width: 0, height: 0, tiles: [] };
  const { cell, ox, oy } = layout(level, view);
  const ops = [];

  ops.push(rect('bg', 0, 0, view.width, view.height, PALETTE.bg));

  const rows = level.tiles || [];
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') {
        ops.push(rect('wall', ox + x * cell, oy + y * cell, cell, cell, PALETTE.wall));
      }
    }
  }

  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const px = ox + x * cell;
      const py = oy + y * cell;
      if (ch === 'M') {
        ops.push(insetRect('merge', px, py, cell, 0.24, PALETTE.accent));
      } else if (ch === 'X') {
        ops.push(state.open
          ? rect('exit', px, py, cell, cell, PALETTE.accent)
          : insetRect('exit', px, py, cell, 0.28, PALETTE.dim));
      } else if (ch === 'H') {
        ops.push(rect('hold', px, py, cell, cell, state.open ? PALETTE.floor : PALETTE.dim));
      }
    }
  }

  for (const p of state.patches || []) {
    ops.push(insetRect('patch', ox + p.x * cell, oy + p.y * cell, cell, 0.22, agentColor(p.color)));
  }
  for (const c of state.conflicts || []) {
    ops.push(insetRect('conflict', ox + c.x * cell, oy + c.y * cell, cell, 0.18, PALETTE.danger));
  }
  for (const d of state.drifts || []) {
    ops.push(circle('drift', ox + (d.x + 0.5) * cell, oy + (d.y + 0.5) * cell, cell * 0.38, PALETTE.danger));
  }
  const player = state.player || { x: 0, y: 0 };
  ops.push(circle('player', ox + (player.x + 0.5) * cell, oy + (player.y + 0.5) * cell, cell * 0.42, PALETTE.accent));

  // The HUD strip, its accent rule, and its texts.
  ops.push(rect('hud', 0, 0, view.width, HUD_HEIGHT, PALETTE.panel));
  ops.push(rect('hudline', 0, HUD_HEIGHT - 2, view.width, 2, PALETTE.accent));
  const hudY = 30;
  ops.push(text('hud', 10, hudY, `SCORE ${state.score}`, PALETTE.text, 16));
  ops.push(text('hud', Math.max(150, Math.round(view.width * 0.26)), hudY,
    `LIVES ${state.lives}`, state.lives <= 1 ? PALETTE.danger : PALETTE.text, 16));
  const merged = `${state.merges}/${level.quorum}`;
  ops.push(text('hud', Math.max(260, Math.round(view.width * 0.5)), hudY,
    merged, state.open ? PALETTE.accent : PALETTE.text, 16));
  ops.push(text('hud', Math.max(360, Math.round(view.width * 0.74)), hudY,
    `LV ${(state.levelIndex || 0) + 1} ${level.name}`, PALETTE.dim, 16));

  const banner = state.status === 'lost' ? 'GAME OVER'
    : state.status === 'won' ? 'ALL MERGED'
      : state.paused ? 'PAUSED'
        : null;
  if (banner) {
    const size = 32;
    // Rough centre for a monospace font: each glyph is about 0.6em wide.
    const x = Math.round(view.width / 2 - banner.length * size * 0.3);
    const y = Math.round(HUD_HEIGHT + (view.height - HUD_HEIGHT) / 2 + size * 0.36);
    const color = banner === 'GAME OVER' ? PALETTE.danger
      : banner === 'ALL MERGED' ? PALETTE.accent
        : PALETTE.text;
    ops.push(text('banner', x, y, banner, color, size));
  }

  return ops;
}

// Put the list on a 2D context; one call per op, nothing else.
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
