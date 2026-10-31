// The canvas renderer: DESIGN.md §11.
//
// drawList is pure: it reads a game state and a view in pixels and returns
// a fresh list of draw operations, each with a `kind`, and every colour a
// value of PALETTE (or of PALETTE.agents). paint applies the list to a 2D
// canvas context. Neither touches the DOM.
import { PALETTE } from './palette.js';

// The strip across the top of the canvas that holds the HUD (§11).
export const HUD_HEIGHT = 48;

// The font family for text ops; a monospace stack to match the look.
const FONT = 'ui-monospace, Menlo, Consolas, monospace';

// Where and how big the map draws inside a view: `cell` pixel-square cells,
// centred under the HUD. `ox`, `oy` is the map's top-left cell's top-left
// corner in pixels.
export function layout(level, view) {
  const cell = Math.floor(Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height));
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// The agent colour of a patch: its colour index into PALETTE.agents, kept
// in range so a stray colour still paints rather than crashing.
function agentColor(color) {
  const n = PALETTE.agents.length;
  const i = ((Math.trunc(color) % n) + n) % n;
  return PALETTE.agents[i] ?? PALETTE.agents[0];
}

// The banner op for a state: what the game says over the board, if
// anything. Playing quietly says nothing.
function bannerOf(state) {
  if (state.paused) return { text: 'PAUSED', color: PALETTE.accent };
  if (state.status === 'won') return { text: 'ALL MERGED', color: PALETTE.accent };
  if (state.status === 'lost') return { text: 'GAME OVER', color: PALETTE.danger };
  return null;
}

// The HUD: score, lives, the level's merge count against its quorum, and
// which level of the run this is.
function hudOps(state, view) {
  const quorum = state.level.quorum;
  const items = [
    { text: `SCORE ${state.score}`, color: PALETTE.accent },
    { text: `LIVES ${state.lives}`, color: state.lives <= 1 ? PALETTE.danger : PALETTE.text },
    { text: `MERGES ${state.merges}/${quorum}`, color: state.open ? PALETTE.accent : PALETTE.text },
    { text: `LEVEL ${state.levelIndex + 1}`, color: PALETTE.dim },
  ];
  const size = 16;
  const y = Math.floor(HUD_HEIGHT / 2) + 7;
  const slot = Math.floor(view.width / items.length);
  return items.map((item, i) => ({
    op: 'text',
    kind: 'hud',
    x: Math.floor(slot * i) + 12,
    y,
    text: item.text,
    color: item.color,
    size,
  }));
}

// The draw list for a state on a view. Pure: reads only, changes nothing.
export function drawList(state, view) {
  const ops = [];
  // 1. The background covers the whole view, always first.
  ops.push({ op: 'rect', kind: 'bg', x: 0, y: 0, w: view.width, h: view.height, color: PALETTE.bg });
  // The HUD strip, with a thin accent line under it.
  ops.push({ op: 'rect', kind: 'panel', x: 0, y: 0, w: view.width, h: HUD_HEIGHT, color: PALETTE.panel });
  ops.push({ op: 'rect', kind: 'hud_line', x: 0, y: HUD_HEIGHT - 1, w: view.width, h: 1, color: PALETTE.accent });

  const level = state.level;
  if (!level || !level.tiles) return ops; // no map to draw: just the HUD strip
  const { cell, ox, oy } = layout(level, view);
  const px = (cx) => ox + cx * cell;
  const py = (cy) => oy + cy * cell;
  const cxOf = (cx) => ox + (cx + 0.5) * cell; // a cell's centre
  const cyOf = (cy) => oy + (cy + 0.5) * cell;

  // 2-3. Terrain: a floor under every open cell, then walls, merge pads,
  // the exit, and the hold doors on it.
  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y] ?? '';
    for (let x = 0; x < level.width; x++) {
      const tile = row[x] ?? '#';
      if (tile === '#') {
        ops.push({ op: 'rect', kind: 'wall', x: px(x), y: py(y), w: cell, h: cell, color: PALETTE.wall });
        continue;
      }
      ops.push({ op: 'rect', kind: 'floor', x: px(x), y: py(y), w: cell, h: cell, color: PALETTE.floor });
      if (tile === 'M') {
        ops.push({ op: 'rect', kind: 'merge', x: px(x), y: py(y), w: cell, h: cell, color: PALETTE.panel });
        ops.push({ op: 'circle', kind: 'merge_mark', x: cxOf(x), y: cyOf(y), r: Math.max(1, cell * 0.22), color: PALETTE.accent });
      } else if (tile === 'X') {
        ops.push({ op: 'rect', kind: 'exit', x: px(x), y: py(y), w: cell, h: cell, color: state.open ? PALETTE.accent : PALETTE.dim });
        if (state.open) {
          ops.push({ op: 'rect', kind: 'exit_mark', x: px(x) + cell * 0.4, y: py(y) + cell * 0.1, w: cell * 0.2, h: cell * 0.8, color: PALETTE.bg });
        }
      } else if (tile === 'H') {
        ops.push({ op: 'rect', kind: 'hold', x: px(x), y: py(y), w: cell, h: cell, color: state.open ? PALETTE.floor : PALETTE.dim });
      }
    }
  }

  // 4. What lies and moves on the grid, each inside its cell's square.
  for (const patch of state.patches ?? []) {
    ops.push({
      op: 'circle',
      kind: 'patch',
      x: cxOf(patch.x),
      y: cyOf(patch.y),
      r: Math.max(1, cell * 0.3),
      color: agentColor(patch.color),
    });
  }
  for (const conflict of state.conflicts ?? []) {
    const inset = cell * 0.36;
    ops.push({
      op: 'rect',
      kind: 'conflict',
      x: px(conflict.x) + inset,
      y: py(conflict.y) + inset,
      w: cell - inset * 2,
      h: cell - inset * 2,
      color: PALETTE.danger,
    });
  }
  for (const drift of state.drifts ?? []) {
    const inset = cell * 0.2;
    ops.push({
      op: 'rect',
      kind: 'drift',
      x: px(drift.x) + inset,
      y: py(drift.y) + inset,
      w: cell - inset * 2,
      h: cell - inset * 2,
      color: PALETTE.danger,
    });
  }
  {
    const player = state.player;
    ops.push({
      op: 'circle',
      kind: 'player',
      x: cxOf(player.x),
      y: cyOf(player.y),
      r: Math.max(1, cell * 0.32),
      color: PALETTE.accent,
    });
  }

  // 5. The HUD text.
  for (const op of hudOps(state, view)) ops.push(op);

  // 6. The banner over the middle of the board, on top of everything.
  const banner = bannerOf(state);
  if (banner) {
    const size = Math.max(16, Math.min(Math.floor(cell * 1.6), 40));
    const width = Math.floor(banner.text.length * size * 0.62);
    ops.push({
      op: 'text',
      kind: 'banner',
      x: Math.max(0, Math.floor((view.width - width) / 2)),
      y: oy + Math.floor((cell * level.height) / 2) + Math.floor(size / 2),
      text: banner.text,
      color: banner.color,
      size,
    });
  }
  return ops;
}

// Draws the list on a 2D canvas context: rects with fillRect, circles with
// arc and fill, text with fillText; every op sets its own fillStyle first.
export function paint(ctx, ops) {
  for (const op of ops) {
    if (op.op === 'rect') {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.op === 'circle') {
      if (!(op.r > 0)) continue;
      ctx.fillStyle = op.color;
      ctx.beginPath();
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (op.op === 'text') {
      ctx.fillStyle = op.color;
      ctx.font = `${op.size ?? 16}px ${FONT}`;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}
