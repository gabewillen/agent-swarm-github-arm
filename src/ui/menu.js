// Menus and HUD text (DESIGN.md §14).
//
// The menu is a plain value of { screen, selected, sound, mode }. Every
// reducer returns a new value and never changes its argument; a screen that
// has no rule for an action returns the menu as it was.

export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

export function menuItems(menu) {
  return ['Play', 'Daily run', 'Level editor', 'How to play', `Sound: ${menu.sound ? 'on' : 'off'}`];
}

export function menuReduce(menu, action) {
  const m = menu;
  switch (m.screen) {
    case 'title':
      if (action === 'up') return { ...m, selected: (m.selected + 4) % 5 };
      if (action === 'down') return { ...m, selected: (m.selected + 1) % 5 };
      if (action === 'select') {
        switch (m.selected) {
          case 0: return { ...m, screen: 'playing', mode: 'campaign' };
          case 1: return { ...m, screen: 'playing', mode: 'daily' };
          case 2: return { ...m, screen: 'editor' };
          case 3: return { ...m, screen: 'help' };
          case 4: return { ...m, sound: !m.sound };
        }
      }
      break;
    case 'help':
      if (action === 'back' || action === 'select') return { ...m, screen: 'title' };
      break;
    case 'editor':
      if (action === 'back') return { ...m, screen: 'title' };
      if (action === 'select') return { ...m, screen: 'playing', mode: 'custom' };
      break;
    case 'playing':
      if (action === 'pause') return { ...m, screen: 'paused' };
      if (action === 'gameover') return { ...m, screen: 'over' };
      break;
    case 'paused':
      if (action === 'pause' || action === 'select') return { ...m, screen: 'playing' };
      if (action === 'back') return { ...m, screen: 'title' };
      break;
    case 'over':
      if (action === 'select') return { ...m, screen: 'title' };
      break;
  }
  return m;
}

// HUD lines for the top strip. The quorum of the current level rides on
// state.level (§5 has no top-level quorum).
export function hudText(state) {
  const quorum = state.level && typeof state.level.quorum === 'number' ? state.level.quorum : state.quorum;
  return [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `MERGES ${state.merges}/${quorum}`,
    `LEVEL ${state.levelIndex + 1}`,
  ];
}
