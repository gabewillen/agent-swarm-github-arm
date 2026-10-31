// Menus and HUD text (DESIGN.md §14). Pure: no DOM, no randomness, no
// mutation of any argument. The menu is a plain object:
//   { screen: 'title' | 'playing' | 'paused' | 'help' | 'editor' | 'over',
//     selected: number, sound: boolean,
//     mode: 'campaign' | 'daily' | 'custom' }

export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

// The title screen's items, in order; the last reflects the sound setting.
export function menuItems(menu) {
  return ['Play', 'Daily run', 'Level editor', 'How to play', `Sound: ${menu.sound ? 'on' : 'off'}`];
}

const wrap = (n, by) => (n + by + 5) % 5;

// The one reducer for every screen. Returns a new menu; never changes the
// argument. An action the current screen does not handle (or that no
// screen handles) returns the menu unchanged.
export function menuReduce(menu, action) {
  const next = { ...menu };
  const { screen } = menu;
  switch (screen) {
    case 'title':
      if (action === 'up') { next.selected = wrap(menu.selected, -1); return next; }
      if (action === 'down') { next.selected = wrap(menu.selected, 1); return next; }
      if (action === 'select') {
        switch (menu.selected) {
          case 0: next.screen = 'playing'; next.mode = 'campaign'; return next;
          case 1: next.screen = 'playing'; next.mode = 'daily'; return next;
          case 2: next.screen = 'editor'; return next;
          case 3: next.screen = 'help'; return next;
          case 4: next.sound = !menu.sound; return next;
          default: return next;
        }
      }
      return next;
    case 'help':
      if (action === 'back' || action === 'select') { next.screen = 'title'; return next; }
      return next;
    case 'editor':
      if (action === 'back') { next.screen = 'title'; return next; }
      if (action === 'select') { next.screen = 'playing'; next.mode = 'custom'; return next; }
      return next;
    case 'playing':
      if (action === 'pause') { next.screen = 'paused'; return next; }
      if (action === 'gameover') { next.screen = 'over'; return next; }
      return next;
    case 'paused':
      if (action === 'pause' || action === 'select') { next.screen = 'playing'; return next; }
      if (action === 'back') { next.screen = 'title'; return next; }
      return next;
    case 'over':
      if (action === 'select') { next.screen = 'title'; return next; }
      return next;
    default:
      return next;
  }
}

// The HUD's four texts, read off the state.
export function hudText(state) {
  const quorum = state.level ? state.level.quorum : state.quorum;
  return [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `MERGES ${state.merges}/${quorum}`,
    `LEVEL ${state.levelIndex + 1}`,
  ];
}
