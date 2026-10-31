// The canvas renderer (DESIGN.md §11). `drawList` is pure: it turns a game
// state and a view into a list of flat draw operations, and `paint` plays
// that list on a 2D canvas context. `layout` fits the level into the view
// under a fixed HUD strip.
import { PALETTE } from './palette.js';

// The strip at the top of the canvas that holds the HUD.
export const HUD_HEIGHT = 48;

export function layout(level, view) {
  const cell = Math.max(
    1,
    Math.floor(Math.min(view.width / level.width, (view.height - HUD_HEIGHT) / level.height)),
  );
  const ox = Math.floor((view.width - cell * level.width) / 2);
  const oy = HUD_HEIGHT + Math.floor((view.height - HUD_HEIGHT - cell * level.height) / 2);
  return { cell, ox, oy };
}

// Banners for the three non-playing statuses; nothing while playing.
function bannerOf(state) {
  if (state.paused) return 'PAUSED';
  if (state.status === 'won') return 'ALL MERGED';
  if (state.status === 'lost') return 'GAME OVER';
  return null;
}

export function drawList(state, view) {
  const ops = [];
  const { level, player, patches, drifts, conflicts, carried } = state;
  const { cell, ox, oy } = layout(level, view);

  const cellX = (x) => ox + x * cell;
  const cellY = (y) => oy + y * cell;
  // The centre of a cell, where round things sit.
  const cx = (x) => cellX(x) + cell / 2;
  const cy = (y) => cellY(y) + cell / 2;
  const pad = Math.floor(cell / 8);

  ops.push({ op: 'rect', kind: 'bg', x: 0, y: 0, w: view.width, h: view.height, color: PALETTE.bg });

  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      const tile = level.tiles[y][x];
      if (tile === '#') {
        ops.push({
          op: 'rect', kind: 'wall', x: cellX(x), y: cellY(y), w: cell, h: cell, color: PALETTE.wall,
        });
      } else if (tile === 'M') {
        ops.push({
          op: 'rect', kind: 'merge', x: cellX(x) + pad, y: cellY(y) + pad, w: cell - pad * 2,
          h: cell - pad * 2, color: PALETTE.panel,
        });
      } else if (tile === 'X') {
        ops.push({
          op: 'rect', kind: 'exit', x: cellX(x) + pad, y: cellY(y) + pad, w: cell - pad * 2,
          h: cell - pad * 2, color: state.open ? PALETTE.accent : PALETTE.dim,
        });
      } else if (tile === 'H') {
        ops.push({
          op: 'rect', kind: 'hold', x: cellX(x), y: cellY(y), w: cell, h: cell,
          color: state.open ? PALETTE.floor : PALETTE.dim,
        });
      }
    }
  }

  // Conflicts are blocks: flat squares that nobody can pass.
  for (const c of conflicts) {
    ops.push({
      op: 'rect', kind: 'conflict', x: cellX(c.x) + pad, y: cellY(c.y) + pad, w: cell - pad * 2,
      h: cell - pad * 2, color: PALETTE.danger,
    });
  }

  for (const p of patches) {
    ops.push({ op: 'circle', kind: 'patch', x: cx(p.x), y: cy(p.y), r: Math.max(1, cell * 0.3), color: PALETTE.agents[p.color] ?? PALETTE.dim });
  }
  for (const d of drifts) {
    ops.push({ op: 'circle', kind: 'drift', x: cx(d.x), y: cy(d.y), r: Math.max(1, cell * 0.33), color: PALETTE.danger });
  }
  ops.push({ op: 'circle', kind: 'player', x: cx(player.x), y: cy(player.y), r: Math.max(1, cell * 0.36), color: PALETTE.accent });

  // Carried patches ride in a short row inside the player's cell.
  for (let i = 0; i < carried.length; i++) {
    const s = Math.max(1, cell * 0.14);
    ops.push({
      op: 'circle', kind: 'carry', x: cx(player.x) + (i - (carried.length - 1) / 2) * (cell / 3),
      y: cellY(player.y) + cell * 0.16, r: s, color: PALETTE.agents[carried[i]] ?? PALETTE.dim,
    });
  }

  // The HUD strip.
  const parts = [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `MERGES ${state.merges}/${state.level.quorum}`,
    `LEVEL ${state.levelIndex + 1}`,
  ];
  const hudXs = (i) => Math.floor(view.width * (0.03 + i * 0.24));
  parts.forEach((text, i) => {
    ops.push({ op: 'text', kind: 'hud', x: hudXs(i), y: 30, text, color: i % 2 === 0 ? PALETTE.text : PALETTE.dim, size: 16 });
  });

  const banner = bannerOf(state);
  if (banner) {
    ops.push({
      op: 'text', kind: 'banner', x: Math.floor(view.width / 2),
      y: Math.floor((view.height + HUD_HEIGHT) / 2), text: banner,
      color: state.status === 'lost' ? PALETTE.danger : state.status === 'won' ? PALETTE.accent : PALETTE.text,
      size: Math.max(16, Math.min(48, cell * 2)),
    });
  }

  return ops;
}

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
