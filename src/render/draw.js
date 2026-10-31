// src/render/draw.js — §11: the canvas renderer.
//
// drawList(state, view) is pure: it reads a game state (§5) and turns it
// into a flat list of draw operations. paint(ctx, ops) executes that list
// on a 2D canvas context. Neither touches the DOM, and neither mutates
// what it is given; src/main.js calls them on requestAnimationFrame.

import { PALETTE } from './palette.js';

// The HUD is a strip across the top of the canvas, this many pixels tall.
export const HUD_HEIGHT = 48;

// Where the level's cells land on a view of the given size: the cell size,
// picked to fit, and the offsets that centre the level in what is left
// below the HUD strip.
export function layout(level, view) {
  const cell = Math.floor(
    Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height),
  );
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// Banner text for the states that carry one; none while playing and
// unpaused.
function bannerFor(state) {
  if (state.paused) return { text: 'PAUSED', color: PALETTE.text };
  if (state.status === 'won') return { text: 'ALL MERGED', color: PALETTE.accent };
  if (state.status === 'lost') return { text: 'GAME OVER', color: PALETTE.danger };
  return null;
}

// The draw operations for one state, in back-to-front order: ground,
// terrain, units, HUD, banner.
export function drawList(state, view) {
  const level = state.level;
  const { cell, ox, oy } = layout(level, view);
  const ops = [];

  // 1. The ground: one rect over the whole view, then the HUD strip's
  //    panel across the top.
  ops.push({
    op: 'rect', kind: 'bg',
    x: 0, y: 0, w: view.width, h: view.height,
    color: PALETTE.bg,
  });
  ops.push({
    op: 'rect', kind: 'panel',
    x: 0, y: 0, w: view.width, h: HUD_HEIGHT,
    color: PALETTE.panel,
  });

  // 2. Terrain: a floor tile under every open cell, then the tiles that
  //    sit on it — walls, merge pads, the exit, the hold doors. Walls and
  //    doors fill their cell; merge pads sit inset, so the route reads
  //    through them.
  for (let y = 0; y < level.height; y++) {
    const row = level.tiles[y] || '';
    for (let x = 0; x < level.width; x++) {
      const tile = row[x] || '#';
      const px = ox + x * cell;
      const py = oy + y * cell;
      if (tile === '#') {
        ops.push({ op: 'rect', kind: 'wall', x: px, y: py, w: cell, h: cell, color: PALETTE.wall });
      } else {
        ops.push({ op: 'rect', kind: 'floor', x: px, y: py, w: cell, h: cell, color: PALETTE.floor });
        if (tile === 'M') {
          const m = Math.round(cell * 0.18);
          ops.push({
            op: 'rect', kind: 'merge',
            x: px + m, y: py + m, w: cell - 2 * m, h: cell - 2 * m,
            color: PALETTE.accent,
          });
        } else if (tile === 'X') {
          ops.push({
            op: 'rect', kind: 'exit',
            x: px, y: py, w: cell, h: cell,
            color: state.open ? PALETTE.accent : PALETTE.dim,
          });
        } else if (tile === 'H') {
          ops.push({
            op: 'rect', kind: 'hold',
            x: px, y: py, w: cell, h: cell,
            color: state.open ? PALETTE.floor : PALETTE.dim,
          });
        }
      }
    }
  }

  // 3. The units that lie on the floor: patches, conflicts, drifts.
  //    Patches and conflicts are squares, drifts are circles.
  for (const patch of state.patches) {
    const m = Math.round(cell * 0.22);
    ops.push({
      op: 'rect', kind: 'patch',
      x: ox + patch.x * cell + m, y: oy + patch.y * cell + m,
      w: cell - 2 * m, h: cell - 2 * m,
      color: PALETTE.agents[patch.color],
    });
  }
  for (const conflict of state.conflicts) {
    const m = Math.round(cell * 0.15);
    ops.push({
      op: 'rect', kind: 'conflict',
      x: ox + conflict.x * cell + m, y: oy + conflict.y * cell + m,
      w: cell - 2 * m, h: cell - 2 * m,
      color: PALETTE.danger,
    });
  }
  for (const drift of state.drifts) {
    ops.push({
      op: 'circle', kind: 'drift',
      x: ox + (drift.x + 0.5) * cell, y: oy + (drift.y + 0.5) * cell,
      r: cell * 0.26,
      color: PALETTE.danger,
    });
  }

  // 4. The player: the one accent circle. The carried patches ride on it
  //    as a stack of small agent-coloured squares.
  const player = state.player;
  ops.push({
    op: 'circle', kind: 'player',
    x: ox + (player.x + 0.5) * cell, y: oy + (player.y + 0.5) * cell,
    r: cell * 0.32,
    color: PALETTE.accent,
  });
  const carried = state.carried || [];
  const square = Math.max(2, Math.round(cell * 0.2));
  const gap = Math.max(square + 1, Math.round(cell * 0.28));
  carried.forEach((color, i) => {
    const top = (carried.length - 1) / 2;
    ops.push({
      op: 'rect', kind: 'carry',
      x: ox + player.x * cell + Math.round(cell / 2 - square / 2),
      y: oy + player.y * cell + Math.round(cell / 2 + (i - top) * gap - square / 2),
      w: square, h: square,
      color: PALETTE.agents[color],
    });
  });

  // 5. The HUD: the numbers that matter while playing.
  const hud = [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `MERGES ${state.merges}/${level.quorum}`,
    `LEVEL ${state.levelIndex + 1}`,
    `CARRY ${carried.length}`,
  ];
  hud.forEach((text, i) => {
    ops.push({
      op: 'text', kind: 'hud',
      x: Math.floor(8 + (i * view.width) / hud.length),
      y: Math.round(HUD_HEIGHT / 2) + 6,
      text,
      color: PALETTE.text,
      size: 14,
    });
  });

  // 6. The banner, over the middle of the play area, when there is one.
  const banner = bannerFor(state);
  if (banner) {
    const size = 22;
    const width = banner.text.length * size * 0.6;
    ops.push({
      op: 'text', kind: 'banner',
      x: Math.max(0, Math.floor((view.width - width) / 2)),
      y: Math.floor((HUD_HEIGHT + view.height) / 2),
      text: banner.text,
      color: banner.color,
      size,
    });
  }

  return ops;
}

// Execute the list on a 2D canvas context: fillStyle from the op, then
// fillRect, arc + fill, or font + fillText, per op, in order.
export function paint(ctx, ops) {
  for (const op of ops) {
    if (!op || !op.op) continue;
    ctx.fillStyle = op.color;
    if (op.op === 'rect') {
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.op === 'circle') {
      ctx.beginPath();
      ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (op.op === 'text') {
      const size = op.size || 16;
      ctx.font = `${size}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
}
