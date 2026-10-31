// Quorum Run: the canvas renderer (DESIGN.md §11).
// drawList turns a game state into a pure list of draw operations; paint
// puts that list on a 2D canvas context. Only palette colours are used.
import { PALETTE } from './palette.js';

// A strip at the top of the canvas for the HUD.
export const HUD_HEIGHT = 48;

// Where on the view the level's grid sits, in pixels.
export function layout(level, view) {
  const cell = Math.floor(
    Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height)
  );
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// The state's draw operations, in paint order. Pure: nothing is changed.
export function drawList(state, view) {
  const level = state.level;
  const { cell, ox, oy } = layout(level, view);
  const ops = [];
  const at = (x, y) => [ox + x * cell, oy + y * cell];
  const centre = (x, y) => [ox + (x + 0.5) * cell, oy + (y + 0.5) * cell];

  // 1. the background covers the whole view.
  ops.push({ op: 'rect', kind: 'bg', x: 0, y: 0, w: view.width, h: view.height, color: PALETTE.bg });

  // 2-3. terrain: floors and walls, then merge pads, the exit, and holds.
  for (let y = 0; y < level.tiles.length; y++) {
    const row = level.tiles[y];
    for (let x = 0; x < row.length; x++) {
      const [tx, ty] = at(x, y);
      if (row[x] === '#') {
        ops.push({ op: 'rect', kind: 'wall', x: tx, y: ty, w: cell, h: cell, color: PALETTE.wall });
      } else {
        ops.push({ op: 'rect', kind: 'floor', x: tx, y: ty, w: cell, h: cell, color: PALETTE.floor });
        if (row[x] === 'M') {
          ops.push({ op: 'rect', kind: 'merge', x: tx, y: ty, w: cell, h: cell, color: PALETTE.panel });
        } else if (row[x] === 'X') {
          const color = state.open ? PALETTE.accent : PALETTE.dim;
          ops.push({ op: 'rect', kind: 'exit', x: tx, y: ty, w: cell, h: cell, color });
        } else if (row[x] === 'H') {
          const color = state.open ? PALETTE.floor : PALETTE.dim;
          ops.push({ op: 'rect', kind: 'hold', x: tx, y: ty, w: cell, h: cell, color });
        }
      }
    }
  }

  // 4. patches, drifts, conflicts, and the player, each inside its cell.
  for (const p of state.patches) {
    const [cx, cy] = centre(p.x, p.y);
    ops.push({ op: 'circle', kind: 'patch', x: cx, y: cy, r: cell * 0.3, color: PALETTE.agents[p.color] });
  }
  for (const d of state.drifts) {
    const [cx, cy] = centre(d.x, d.y);
    ops.push({ op: 'circle', kind: 'drift', x: cx, y: cy, r: cell * 0.4, color: PALETTE.danger });
  }
  for (const c of state.conflicts) {
    const [cx, cy] = centre(c.x, c.y);
    ops.push({ op: 'circle', kind: 'conflict', x: cx, y: cy, r: cell * 0.45, color: PALETTE.danger });
  }
  {
    const [cx, cy] = centre(state.player.x, state.player.y);
    ops.push({ op: 'circle', kind: 'player', x: cx, y: cy, r: cell * 0.35, color: PALETTE.accent });
  }

  // 5. the HUD.
  const score = `SCORE ${state.score}`;
  const lives = `LIVES ${state.lives}`;
  const merges = `${state.merges}/${level.quorum}`;
  const levelText = `LEVEL ${state.levelIndex + 1}`;
  ops.push({ op: 'text', kind: 'hud', x: 16, y: 30, text: score, color: PALETTE.text, size: 16 });
  ops.push({ op: 'text', kind: 'hud', x: 150, y: 30, text: lives, color: PALETTE.text, size: 16 });
  ops.push({ op: 'text', kind: 'hud', x: 270, y: 30, text: merges, color: PALETTE.accent, size: 16 });
  ops.push({ op: 'text', kind: 'hud', x: 380, y: 30, text: levelText, color: PALETTE.dim, size: 16 });

  // 6. the banner, only when the game is paused, won, or lost.
  const banner = state.paused ? 'PAUSED' : state.status === 'won' ? 'ALL MERGED' : state.status === 'lost' ? 'GAME OVER' : null;
  if (banner) {
    const size = 28;
    const bx = Math.floor((view.width - banner.length * size * 0.6) / 2);
    const by = Math.floor(view.height / 2 + HUD_HEIGHT);
    ops.push({ op: 'text', kind: 'banner', x: bx, y: by, text: banner, color: PALETTE.text, size });
  }

  return ops;
}

// Paint the list on a 2D canvas context, in order.
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
      ctx.fillText(o.text, o.x, o.y);
    }
  }
}
