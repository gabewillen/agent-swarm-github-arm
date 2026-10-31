// §11 — the renderer. drawList turns a game state into a pure list of draw
// operations, each with a `kind`; paint applies that list to a 2D canvas
// context. Every colour in the list is a value of PALETTE (or of
// PALETTE.agents).
import { PALETTE } from './palette.js';

// The HUD's strip along the top of the canvas.
export const HUD_HEIGHT = 48;

// Square cells that fit under the HUD strip, centred both ways.
export function layout(level, view) {
  const cell = Math.floor(Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// One exact shape per op kind: only the fields its painter reads.
const opRect = (kind, x, y, w, h, color) => ({ op: 'rect', kind, x, y, w, h, color });
const opCircle = (kind, x, y, r, color) => ({ op: 'circle', kind, x, y, r, color });
const opText = (kind, x, y, text, color, size) => ({ op: 'text', kind, x, y, text, color, size });

export function drawList(state, view) {
  const level = state.level;
  const { cell, ox, oy } = layout(level, view);
  // A cell's left and top edge, and its centre, on the canvas.
  const cx = (x) => ox + x * cell;
  const cy = (y) => oy + y * cell;
  const midx = (x) => cx(x) + cell / 2;
  const midy = (y) => cy(y) + cell / 2;
  // A fraction of the cell, floored so nothing vanishes on tiny boards.
  const unit = (f) => Math.max(1, Math.round(cell * f));
  const ops = [];

  // 1. The ground, under everything; then the HUD's panel and its hairline.
  ops.push(opRect('bg', 0, 0, view.width, view.height, PALETTE.bg));
  ops.push(opRect('hudBg', 0, 0, view.width, HUD_HEIGHT, PALETTE.panel));
  ops.push(opRect('hudLine', 0, HUD_HEIGHT - 1, view.width, 1, PALETTE.wall));

  // 2, 3. The terrain: walls, the floor beneath everything else, and the
  // features over it. A closed hold is a solid over the floor; an open one
  // takes the floor's colour and reads as ground. A closed exit is dim; an
  // open one grows and takes the accent.
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const ch = level.tiles[y][x];
      if (ch === '#') {
        ops.push(opRect('wall', cx(x), cy(y), cell, cell, PALETTE.wall));
        continue;
      }
      ops.push(opRect('floor', cx(x), cy(y), cell, cell, PALETTE.floor));
      if (ch === 'M') {
        const i = unit(0.3);
        ops.push(opRect('merge', cx(x) + i, cy(y) + i, cell - i * 2, cell - i * 2, PALETTE.dim));
      } else if (ch === 'H') {
        ops.push(opRect('hold', cx(x), cy(y), cell, cell, state.open ? PALETTE.floor : PALETTE.dim));
      } else if (ch === 'X') {
        const i = unit(state.open ? 0.12 : 0.3);
        ops.push(opRect('exit', cx(x) + i, cy(y) + i, cell - i * 2, cell - i * 2, state.open ? PALETTE.accent : PALETTE.dim));
      }
    }
  }

  // 4. The actors, each inside its own cell.
  for (const patch of state.patches || []) {
    ops.push(opCircle('patch', midx(patch.x), midy(patch.y), unit(0.2), PALETTE.agents[patch.color] ?? PALETTE.agents[0]));
  }
  for (const drift of state.drifts || []) {
    ops.push(opCircle('drift', midx(drift.x), midy(drift.y), unit(0.32), PALETTE.danger));
  }
  for (const conflict of state.conflicts || []) {
    const i = unit(0.28);
    ops.push(opRect('conflict', cx(conflict.x) + i, cy(conflict.y) + i, cell - i * 2, cell - i * 2, PALETTE.danger));
  }
  ops.push(opCircle('player', midx(state.player.x), midy(state.player.y), unit(0.36), PALETTE.accent));

  // 5. The HUD: score in the accent, the rest in the text colour.
  const size = view.width < 420 ? 11 : 16;
  const baseline = Math.round((HUD_HEIGHT + size) / 2);
  const hud = [
    [`SCORE ${state.score}`, PALETTE.accent],
    [`LIVES ${state.lives}`, PALETTE.text],
    [`MERGES ${state.merges}/${level.quorum}`, PALETTE.text],
    [`LEVEL ${state.levelIndex + 1}`, PALETTE.text],
  ];
  hud.forEach(([text, color], i) => ops.push(opText('hud', Math.round((view.width * i) / 4) + 8, baseline, text, color, size)));

  // 6. The banner over the board.
  const banner = state.status === 'won' ? 'ALL MERGED' : state.status === 'lost' ? 'GAME OVER' : state.paused ? 'PAUSED' : null;
  if (banner) {
    const size = Math.max(16, Math.min(32, cell));
    const color = state.status === 'lost' ? PALETTE.danger : PALETTE.accent;
    ops.push(opText('banner', Math.round(view.width / 2), Math.round((HUD_HEIGHT + view.height) / 2), banner, color, size));
  }

  return ops;
}

// Paint the list on a 2D context: for each op set fillStyle, then draw it.
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
      ctx.textAlign = o.kind === 'banner' ? 'center' : 'left';
      ctx.fillText(o.text, o.x, o.y);
    }
  }
  ctx.textAlign = 'left';
}
