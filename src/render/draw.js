// The canvas renderer, DESIGN.md §11. drawList turns game state into a
// pure list of draw operations; paint puts that list on a 2D canvas
// context. Every colour comes from the palette.
import { PALETTE } from './palette.js';

// The HUD strip at the top of the canvas.
export const HUD_HEIGHT = 48;

const FONT = 'monospace';
const HUD_SIZE = 18;
const HUD_BASELINE = 31;
const BANNER_SIZE = 36;

// Where and how big each cell is drawn for a view of the canvas in pixels.
export function layout(level, view) {
  const cell = Math.floor(Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// A patch's colour: its colour number names one of the agent colours.
function patchColor(color) {
  const n = PALETTE.agents.length;
  return PALETTE.agents[((color % n) + n) % n];
}

// One draw operation per element of the game, back to front.
export function drawList(state, view) {
  const level = state.level;
  const { cell, ox, oy } = layout(level, view);
  const cellRect = (cx, cy) => ({ x: ox + cx * cell, y: oy + cy * cell, w: cell, h: cell });
  const centre = (cx, cy) => ({ x: Math.round(ox + (cx + 0.5) * cell), y: Math.round(oy + (cy + 0.5) * cell) });
  // A rect of `frac` cells, centred in a cell.
  const inset = (cx, cy, frac) => {
    const s = Math.round(cell * frac);
    return { x: ox + cx * cell + Math.round((cell - s) / 2), y: oy + cy * cell + Math.round((cell - s) / 2), w: s, h: s };
  };
  const ops = [];

  // The ground, the HUD strip, and the board.
  ops.push({ op: 'rect', kind: 'bg', x: 0, y: 0, w: view.width, h: view.height, color: PALETTE.bg });
  ops.push({ op: 'rect', kind: 'panel', x: 0, y: 0, w: view.width, h: HUD_HEIGHT, color: PALETTE.panel });
  ops.push({ op: 'rect', kind: 'floor', x: ox, y: oy, w: cell * level.width, h: cell * level.height, color: PALETTE.floor });

  // Terrain: walls, merge pads, the exit, hold doors.
  let exit = null;
  const pads = [];
  const holds = [];
  level.tiles.forEach((row, cy) => {
    for (let cx = 0; cx < row.length; cx++) {
      const ch = row[cx];
      if (ch === '#') {
        ops.push({ op: 'rect', kind: 'wall', ...cellRect(cx, cy), color: PALETTE.wall });
      } else if (ch === 'M') {
        pads.push({ cx, cy });
      } else if (ch === 'X') {
        exit = { cx, cy };
      } else if (ch === 'H') {
        holds.push({ cx, cy });
      }
    }
  });
  for (const { cx, cy } of pads) {
    ops.push({ op: 'rect', kind: 'merge', ...inset(cx, cy, 0.5), color: PALETTE.accent });
  }
  for (const { cx, cy } of holds) {
    ops.push({ op: 'rect', kind: 'hold', ...cellRect(cx, cy), color: state.open ? PALETTE.floor : PALETTE.dim });
  }
  if (exit) {
    ops.push({ op: 'rect', kind: 'exit', ...cellRect(exit.cx, exit.cy), color: state.open ? PALETTE.accent : PALETTE.dim });
  }

  // What lives on the board: patches, conflicts, drifts, the player.
  for (const patch of state.patches) {
    const c = centre(patch.x, patch.y);
    ops.push({ op: 'circle', kind: 'patch', x: c.x, y: c.y, r: Math.max(1, Math.round(cell * 0.3)), color: patchColor(patch.color) });
  }
  for (const conflict of state.conflicts) {
    ops.push({ op: 'rect', kind: 'conflict', ...inset(conflict.x, conflict.y, 0.6), color: PALETTE.danger });
  }
  for (const drift of state.drifts) {
    const c = centre(drift.x, drift.y);
    ops.push({ op: 'circle', kind: 'drift', x: c.x, y: c.y, r: Math.max(1, Math.round(cell * 0.34)), color: PALETTE.danger });
  }
  const p = centre(state.player.x, state.player.y);
  ops.push({ op: 'circle', kind: 'player', x: p.x, y: p.y, r: Math.max(1, Math.round(cell * 0.38)), color: PALETTE.accent });

  // The HUD: score, lives, merges towards the quorum, the level.
  const quorum = `${state.merges}/${level.quorum}`;
  const hud = [
    { x: Math.round(view.width * 0.02), text: `SCORE ${state.score}`, color: PALETTE.text },
    { x: Math.round(view.width * 0.27), text: `LIVES ${state.lives}`, color: PALETTE.text },
    { x: Math.round(view.width * 0.5), text: quorum, color: state.open ? PALETTE.accent : PALETTE.text },
    { x: Math.round(view.width * 0.73), text: `LEVEL ${state.levelIndex + 1}`, color: PALETTE.text },
  ];
  for (const item of hud) {
    ops.push({ op: 'text', kind: 'hud', x: item.x, y: HUD_BASELINE, text: item.text, color: item.color, size: HUD_SIZE });
  }

  // A banner over the board when the run is paused or over.
  const banner = state.status === 'lost' ? 'GAME OVER'
    : state.status === 'won' ? 'ALL MERGED'
    : state.paused ? 'PAUSED' : null;
  if (banner) {
    const color = banner === 'GAME OVER' ? PALETTE.danger
      : banner === 'ALL MERGED' ? PALETTE.accent : PALETTE.text;
    const x = Math.round(view.width / 2 - banner.length * BANNER_SIZE * 0.3 / 2);
    const y = HUD_HEIGHT + Math.round((view.height - HUD_HEIGHT) / 2 + BANNER_SIZE * 0.35);
    ops.push({ op: 'text', kind: 'banner', x, y, text: banner, color, size: BANNER_SIZE });
  }

  return ops;
}

// Draw the list on a 2D canvas context, in order.
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
      ctx.font = `${o.size}px ${FONT}`;
      ctx.fillText(o.text, o.x, o.y);
    }
  }
}
