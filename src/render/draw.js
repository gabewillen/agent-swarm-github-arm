// Quorum Run's canvas renderer (DESIGN.md §11). drawList is pure: it turns
// a game state, a view size, and the palette into a list of flat draw
// operations, and paint executes that list on a 2D canvas context.
import { PALETTE } from './palette.js';

// The HUD occupies this strip (pixels) at the top of the canvas.
export const HUD_HEIGHT = 48;

// Where the level's cells land on the canvas for a given view.
export function layout(level, view) {
  const cell = Math.floor(Math.min(
    view.width / level.width,
    (view.height - HUD_HEIGHT) / level.height,
  ));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// Every op carries exactly the fields its op needs, plus a kind.
const rect = (kind, x, y, w, h, color) => ({ op: 'rect', kind, x, y, w, h, color });
const circle = (kind, x, y, r, color) => ({ op: 'circle', kind, x, y, r, color });
const text = (kind, x, y, str, size, color) => ({ op: 'text', kind, x, y, text: str, size, color });

// A patch colour, forgiving of a state a validator would reject.
function agentColour(color) {
  const n = PALETTE.agents.length;
  if (!Number.isInteger(color) || color < 0 || color >= n) return PALETTE.dim;
  return PALETTE.agents[color];
}

export function drawList(state, view) {
  const ops = [];
  const level = state.level;
  const { cell, ox, oy } = layout(level, view);

  // 1. The ground: one full-view rect, then the HUD strip above the field.
  ops.push(rect('bg', 0, 0, view.width, view.height, PALETTE.bg));
  ops.push(rect('panel', 0, 0, view.width, HUD_HEIGHT, PALETTE.panel));
  ops.push(rect('rule', 0, HUD_HEIGHT - 2, view.width, 2, PALETTE.accent));

  // 2. The field's floor, slightly lighter than the ground around it.
  ops.push(rect('floor', ox, oy, cell * level.width, cell * level.height, PALETTE.floor));

  // 3. Terrain, cell by cell in reading order: walls, merge pads, the
  //    exit, and hold doors. Holds vanish into the floor when open.
  const tiles = level.tiles;
  for (let y = 0; y < level.height; y++) {
    const row = tiles[y] ?? '';
    for (let x = 0; x < level.width; x++) {
      const px = ox + x * cell;
      const py = oy + y * cell;
      const ch = row[x];
      if (ch === '#') ops.push(rect('wall', px, py, cell, cell, PALETTE.wall));
      else if (ch === 'M') {
        ops.push(rect('merge', px + cell * 0.2, py + cell * 0.2, cell * 0.6, cell * 0.6, PALETTE.dim));
      } else if (ch === 'P') {
        // Spawn points rest as faint marks until a patch lands on them.
        // (Parsed tiles turn spawners into floor; this shows in previews.)
        ops.push(rect('spawn', px + cell * 0.38, py + cell * 0.38, cell * 0.24, cell * 0.24, PALETTE.wall));
      } else if (ch === 'X') {
        ops.push(rect('exit', px, py, cell, cell, state.open ? PALETTE.accent : PALETTE.dim));
      } else if (ch === 'H') {
        // A closed hold is a pillar through the cell; open, it sinks.
        ops.push(rect('hold', px + cell * 0.3, py, cell * 0.4, cell, state.open ? PALETTE.floor : PALETTE.dim));
      }
    }
  }

  // 4. The actors, each inside its cell: patches under everyone,
  //    drifts over patches, conflicts over drifts, the player at last.
  const patchSize = cell * 0.44;
  for (const p of state.patches ?? []) {
    ops.push(rect('patch', ox + p.x * cell + cell * 0.28, oy + p.y * cell + cell * 0.28,
      patchSize, patchSize, agentColour(p.color)));
  }
  const driftSize = cell * 0.84;
  for (const d of state.drifts ?? []) {
    ops.push(rect('drift', ox + d.x * cell + cell * 0.08, oy + d.y * cell + cell * 0.08,
      driftSize, driftSize, PALETTE.danger));
  }
  for (const c of state.conflicts ?? []) {
    ops.push(rect('conflict', ox + c.x * cell, oy + c.y * cell, cell, cell, PALETTE.danger));
  }
  const playerSize = cell * 0.7;
  ops.push(rect('player', ox + state.player.x * cell + cell * 0.15, oy + state.player.y * cell + cell * 0.15,
    playerSize, playerSize, PALETTE.accent));

  // Carried patches, as small agent-coloured squares in the HUD.
  const carrySize = 10;
  const carryX = Math.floor(view.width * 0.62);
  (state.carried ?? []).forEach((color, i) => {
    ops.push(rect('carry', carryX + i * 14, HUD_HEIGHT / 2 - carrySize / 2, carrySize, carrySize, agentColour(color)));
  });
  if ((state.carried ?? []).length === 0) {
    ops.push(rect('carry', carryX, HUD_HEIGHT / 2 - carrySize / 2, carrySize, carrySize, PALETTE.wall));
  }

  // 5. The HUD.
  const hud = [
    { str: `SCORE ${state.score ?? 0}`, color: PALETTE.accent, x: 16 },
    { str: `LIVES ${state.lives ?? 0}`, color: PALETTE.text, x: Math.floor(view.width * 0.3) },
    { str: `MERGES ${state.merges ?? 0}/${level.quorum}`, color: PALETTE.text, x: Math.floor(view.width * 0.46) },
    { str: `LEVEL ${(state.levelIndex ?? 0) + 1}`, color: PALETTE.text, x: Math.floor(view.width * 0.8) },
  ];
  for (const h of hud) ops.push(text('hud', h.x, 30, h.str, 16, h.color));

  // 6. A banner over the field when the game needs saying.
  let banner = null;
  let bannerColor = PALETTE.text;
  let bannerSize = 24;
  if (state.status === 'won') { banner = 'ALL MERGED'; bannerColor = PALETTE.accent; bannerSize = 24; }
  else if (state.status === 'lost') { banner = 'GAME OVER'; bannerColor = PALETTE.danger; bannerSize = 24; }
  else if (state.paused) { banner = 'PAUSED'; }
  if (banner) {
    ops.push(text('banner', Math.floor(view.width / 2), Math.floor(view.height / 2) + 8, banner, bannerSize, bannerColor));
  }
  return ops;
}

// Runs the ops on a 2D canvas context. Only the three ops exist.
export function paint(ctx, ops) {
  for (const op of ops) {
    if (op.op === 'rect') {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.op === 'circle') {
      ctx.fillStyle = op.color;
      ctx.beginPath();
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (op.op === 'text') {
      ctx.font = `${op.size}px monospace`;
      ctx.fillStyle = op.color;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}
