// The canvas renderer: layout, a pure draw list, and a painter.
//
// `drawList(state, view)` turns game state into flat draw operations and
// `paint(ctx, ops)` puts them on a 2D context. Nothing here knows about
// the DOM: it only writes to the object it is given.
import { PALETTE } from './palette.js';

// A strip at the top of the canvas for the HUD.
export const HUD_HEIGHT = 48;

// How a level fits a pixel view: the cell size and the offsets that
// centre the board under the HUD strip.
export function layout(level, view) {
  const cell = Math.floor(
    Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height)
  );
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// Rough width of monospace text, for right-aligning and centring it.
function textWidth(text, size) {
  return Math.round(text.length * size * 0.6);
}

// Cell-aligned rectangles: the terrain, the pads, the doors, the exits.
function cellRect(cx, cy, cell, ox, oy, kind, color, inset = 0) {
  const pad = Math.round(cell * inset);
  return {
    op: 'rect',
    kind,
    x: ox + cx * cell + pad,
    y: oy + cy * cell + pad,
    w: cell - pad * 2,
    h: cell - pad * 2,
    color,
  };
}

// A circle at a cell's centre, for the movers.
function cellCircle(cx, cy, cell, ox, oy, kind, color, radiusOf) {
  return {
    op: 'circle',
    kind,
    x: ox + Math.round((cx + 0.5) * cell),
    y: oy + Math.round((cy + 0.5) * cell),
    r: Math.max(2, Math.round(cell * radiusOf)),
    color,
  };
}

// Every cell the map holds, in reading order.
function* cells(tiles) {
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) yield [x, y, tiles[y][x]];
  }
}

// The draw list for a state on a pixel view. Pure: it reads the state
// and changes nothing.
export function drawList(state, view) {
  const { width, height } = view;
  const level = state.level;
  const { cell, ox, oy } = layout(level, view);
  const ops = [];

  // 1. The ground: the whole view in the near-black background, then a
  //    slightly lighter floor square on every open cell.
  ops.push({ op: 'rect', kind: 'bg', x: 0, y: 0, w: width, h: height, color: PALETTE.bg });
  for (const [x, y, tile] of cells(level.tiles)) {
    if (tile !== '#') ops.push(cellRect(x, y, cell, ox, oy, 'floor', PALETTE.floor));
  }

  // 2. Walls.
  for (const [x, y, tile] of cells(level.tiles)) {
    if (tile === '#') ops.push(cellRect(x, y, cell, ox, oy, 'wall', PALETTE.wall));
  }

  // 3. Terrain features: merge pads, the exit, the hold doors.
  for (const [x, y, tile] of cells(level.tiles)) {
    if (tile === 'M') ops.push(cellRect(x, y, cell, ox, oy, 'merge', PALETTE.dim, 0.25));
    if (tile === 'X') {
      ops.push(cellRect(x, y, cell, ox, oy, 'exit', state.open ? PALETTE.accent : PALETTE.dim));
    }
    if (tile === 'H') {
      ops.push(cellRect(x, y, cell, ox, oy, 'hold', state.open ? PALETTE.floor : PALETTE.dim));
    }
  }

  // 4. The inhabitants. The player is drawn last, on top.
  for (const patch of state.patches) {
    ops.push(cellRect(patch.x, patch.y, cell, ox, oy, 'patch', PALETTE.agents[patch.color], 0.2));
  }
  for (const conflict of state.conflicts) {
    ops.push(cellRect(conflict.x, conflict.y, cell, ox, oy, 'conflict', PALETTE.danger, 0.1));
  }
  for (const drift of state.drifts) {
    ops.push(cellCircle(drift.x, drift.y, cell, ox, oy, 'drift', PALETTE.danger, 0.32));
  }
  ops.push(cellCircle(state.player.x, state.player.y, cell, ox, oy, 'player', PALETTE.accent, 0.34));

  // 5. The HUD strip: score, lives, merges of the quorum, what is
  //    carried, and the level's name.
  const y = 30;
  const size = 16;
  const colour = PALETTE.text;
  ops.push({ op: 'text', kind: 'hud', x: 12, y, text: `SCORE ${state.score}`, color: colour, size });
  ops.push({ op: 'text', kind: 'hud', x: 150, y, text: `LIVES ${state.lives}`, color: colour, size });
  ops.push({
    op: 'text',
    kind: 'hud',
    x: 260,
    y,
    text: `${state.merges}/${level.quorum}`,
    color: colour,
    size,
  });
  const carryW = 12;
  const carryGap = 4;
  const carryEnd = width - 12 - textWidth(level.name, size) - 16;
  for (let i = 0; i < 3; i++) {
    const color = i < state.carried.length ? PALETTE.agents[state.carried[i]] : PALETTE.panel;
    ops.push({
      op: 'rect',
      kind: 'carry',
      x: carryEnd - (3 - i) * (carryW + carryGap),
      y: y - 12,
      w: carryW,
      h: carryW,
      color,
    });
  }
  ops.push({
    op: 'text',
    kind: 'hud',
    x: width - 12 - textWidth(level.name, size),
    y,
    text: level.name,
    color: PALETTE.dim,
    size,
  });

  // 6. The banner when the game is paused, won, or lost.
  let banner = null;
  if (state.status === 'won') banner = { text: 'ALL MERGED', color: PALETTE.accent };
  else if (state.status === 'lost') banner = { text: 'GAME OVER', color: PALETTE.danger };
  else if (state.paused) banner = { text: 'PAUSED', color: PALETTE.text };
  if (banner) {
    const bSize = 28;
    ops.push({
      op: 'text',
      kind: 'banner',
      x: Math.round((width - textWidth(banner.text, bSize)) / 2),
      y: Math.round(oy + (cell * level.height) / 2),
      text: banner.text,
      color: banner.color,
      size: bSize,
    });
  }

  return ops;
}

// Put the draw list on a 2D canvas context: a fillRect per rect, a path
// and a fill per circle, and a fillText per text, each in its colour.
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
