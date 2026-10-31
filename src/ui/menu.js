// Menus and HUD text (DESIGN.md §14). A menu is plain data: reducing it
// returns a new menu and never changes the one it was given.

const TITLE_ITEMS = ['Play', 'Daily run', 'Level editor', 'How to play'];
// The title's items, the last one being the sound setting.
const TITLE_COUNT = TITLE_ITEMS.length + 1;

const wrap = (i) => ((Math.trunc(i) % TITLE_COUNT) + TITLE_COUNT) % TITLE_COUNT;

const screen = (menu, name, patch) => ({ ...menu, screen: name, ...patch });

export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

export function menuItems(menu) {
  const m = menu || menuInit();
  return [...TITLE_ITEMS, m.sound ? 'Sound: on' : 'Sound: off'];
}

function titleSelect(menu) {
  const i = wrap(menu.selected);
  if (i === 0) return screen(menu, 'playing', { mode: 'campaign' });
  if (i === 1) return screen(menu, 'playing', { mode: 'daily' });
  if (i === 2) return screen(menu, 'editor', {});
  if (i === 3) return screen(menu, 'help', {});
  return { ...menu, sound: !menu.sound };
}

export function menuReduce(menu, action) {
  const m = menu || menuInit();
  const on = (name) => screen(m, name, {});
  switch (m.screen) {
    case 'title':
      if (action === 'up') return { ...m, selected: wrap(m.selected - 1) };
      if (action === 'down') return { ...m, selected: wrap(m.selected + 1) };
      if (action === 'select') return titleSelect(m);
      return { ...m };
    case 'help':
      if (action === 'back' || action === 'select') return on('title');
      return { ...m };
    case 'editor':
      if (action === 'back') return on('title');
      if (action === 'select') return screen(m, 'playing', { mode: 'custom' });
      return { ...m };
    case 'playing':
      if (action === 'pause') return on('paused');
      if (action === 'gameover') return on('over');
      return { ...m };
    case 'paused':
      if (action === 'pause' || action === 'select') return on('playing');
      if (action === 'back') return on('title');
      return { ...m };
    case 'over':
      if (action === 'select') return on('title');
      if (action === 'back') return on('title');
      return { ...m };
    default:
      return { ...m };
  }
}

export function hudText(state) {
  const s = state || {};
  const level = s.level || {};
  return [
    `SCORE ${s.score ?? 0}`,
    `LIVES ${s.lives ?? 0}`,
    `MERGES ${s.merges ?? 0}/${level.quorum ?? 0}`,
    `LEVEL ${(s.levelIndex ?? 0) + 1}`,
  ];
}
