// The canvas renderer of §11. drawList is pure: it turns a game state and a
// view size into a list of draw operations, and paint puts a list on a 2D
// canvas context. Every colour is a value of PALETTE.
import { PALETTE } from './palette.js';

// The HUD strip at the top of the canvas, in pixels.
export const HUD_HEIGHT = 48;

// Fits the level into the view under the HUD and centres it.
export function layout(level, view) {
  const cell = Math.floor(Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// The draw list for a state. Order: background, HUD, walls and floors, spawn
// points, special tiles, lying patches, drifts, conflicts, the player, the
// carried patches, and a banner over it all when the run is paused or over.
export function drawList(state, view) {
  const { cell, ox, oy } = layout(state.level, view);
  const at = (x, y) => [ox + x * cell, oy + y * cell];
  const rect = (kind, x, y, w, h, color) => ({ op: 'rect', kind, x, y, w, h, color });
  const cellRect = (kind, x, y, inset, color) =>
    rect(kind, ox + x * cell + cell * inset, oy + y * cell + cell * inset, cell - 2 * cell * inset, cell - 2 * cell * inset, color);
  const circle = (kind, x, y, r, color) => ({ op: 'circle', kind, x, y, r, color });
  const text = (kind, x, y, s, color, size) => ({ op: 'text', kind, x, y, text: s, color, size });

  const ops = [];
  const push = (op) => { ops.push(op); return op; };

  // 1. The ground, then the HUD strip over its top.
  push(rect('bg', 0, 0, view.width, view.height, PALETTE.bg));
  push(rect('hud', 0, 0, view.width, HUD_HEIGHT, PALETTE.panel));

  // The HUD text: score, lives, merges/quorum, level.
  const hud = [
    [`SCORE ${state.score}`, PALETTE.text],
    [`LIVES ${state.lives}`, state.lives <= 1 ? PALETTE.danger : PALETTE.text],
    [`${state.merges}/${state.level.quorum}`, PALETTE.accent],
    [`LEVEL ${state.levelIndex + 1}`, PALETTE.dim],
  ];
  hud.forEach(([s, color], i) => {
    push(text('hud', Math.round(view.width * (0.02 + i * 0.24)), Math.round(HUD_HEIGHT / 2 + 5), s, color, Math.round(HUD_HEIGHT / 3)));
  });

  // 2 and 3. Walls, floors, and the special tiles.
  const pads = [];
  const exits = [];
  const holds = [];
  state.level.tiles.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const t = row[x];
      if (t === '#') push(rect('wall', ox + x * cell, oy + y * cell, cell, cell, PALETTE.wall));
      else push(rect('floor', ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2, PALETTE.floor));
      if (t === 'M') pads.push([x, y]);
      else if (t === 'X') exits.push([x, y]);
      else if (t === 'H') holds.push([x, y]);
    }
  });

  // Empty spawn points read as small dim squares; a lying patch covers its own.
  for (const s of state.level.spawns) {
    const [px, py] = at(s.x, s.y);
    push(rect('spawn', px + cell * 0.42, py + cell * 0.42, cell * 0.16, cell * 0.16, PALETTE.dim));
  }

  // Merge pads are dim circles; the exit opens with the accent; hold doors
  // become floor when the quorum is reached.
  for (const [x, y] of pads) {
    const [px, py] = at(x, y);
    push(circle('merge', px + cell / 2, py + cell / 2, cell * 0.3, PALETTE.dim));
  }
  for (const [x, y] of exits) push(cellRect('exit', x, y, 0.2, state.open ? PALETTE.accent : PALETTE.dim));
  for (const [x, y] of holds) push(rect('hold', ox + x * cell, oy + y * cell, cell, cell, state.open ? PALETTE.floor : PALETTE.dim));

  // 4. Lying patches in their agent colour, drifts and conflicts in danger,
  // and exactly one player in the accent.
  for (const p of state.patches) push(cellRect('patch', p.x, p.y, 0.17, PALETTE.agents[p.color]));
  for (const d of state.drifts) push(cellRect('drift', d.x, d.y, 0.12, PALETTE.danger));
  for (const c of state.conflicts) push(cellRect('conflict', c.x, c.y, 0.06, PALETTE.danger));

  const [qx, qy] = at(state.player.x, state.player.y);
  push(rect('player', qx + cell * 0.2, qy + cell * 0.2, cell * 0.6, cell * 0.6, PALETTE.accent));
  state.carried.forEach((color, i) => {
    const size = cell * 0.16;
    push(rect('carry', qx + (cell - size * state.carried.length) / 2 + i * size, qy + cell * 0.72, size, size, PALETTE.agents[color]));
  });

  // 5 and 6. A banner reads the run's state; nothing while playing.
  let banner = null;
  if (state.paused) banner = ['PAUSED', PALETTE.accent];
  else if (state.status === 'won') banner = ['ALL MERGED', PALETTE.text];
  else if (state.status === 'lost') banner = ['GAME OVER', PALETTE.danger];
  if (banner) {
    push(text('banner', Math.round(view.width / 2), Math.round(HUD_HEIGHT + (view.height - HUD_HEIGHT) / 2 + 8), banner[0], banner[1], 24));
  }

  return ops;
}

// Puts a draw list on a 2D canvas context, one fill per op, all in the op's
// colour.
export function paint(ctx, ops) {
  for (const op of ops) {
    ctx.fillStyle = op.color;
    if (op.op === 'rect') ctx.fillRect(op.x, op.y, op.w, op.h);
    else if (op.op === 'circle') {
      ctx.beginPath();
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (op.op === 'text') {
      ctx.font = `${op.size ?? 16}px monospace`;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}
