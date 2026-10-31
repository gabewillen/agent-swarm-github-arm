// Menus and HUD text (DESIGN.md §14): a pure little state machine for the
// screens and the selection, plus the HUD line the renderer draws.

export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

export function menuItems(menu) {
  return ['Play', 'Daily run', 'Level editor', 'How to play', menu.sound ? 'Sound: on' : 'Sound: off'];
}

export function menuReduce(menu, action) {
  // On the title screen the selection picks what select does.
  if (menu.screen === 'title') {
    if (action === 'up' || action === 'down') {
      const d = action === 'up' ? -1 : 1;
      return { ...menu, selected: (menu.selected + d + 5) % 5 };
    }
    if (action === 'select') {
      if (menu.selected === 0) return { ...menu, screen: 'playing', mode: 'campaign' };
      if (menu.selected === 1) return { ...menu, screen: 'playing', mode: 'daily' };
      if (menu.selected === 2) return { ...menu, screen: 'editor' };
      if (menu.selected === 3) return { ...menu, screen: 'help' };
      return { ...menu, sound: !menu.sound };
    }
    return { ...menu };
  }
  if (menu.screen === 'help') {
    if (action === 'back' || action === 'select') return { ...menu, screen: 'title' };
    return { ...menu };
  }
  if (menu.screen === 'editor') {
    if (action === 'back') return { ...menu, screen: 'title' };
    if (action === 'select') return { ...menu, screen: 'playing', mode: 'custom' };
    return { ...menu };
  }
  if (menu.screen === 'playing') {
    if (action === 'pause') return { ...menu, screen: 'paused' };
    if (action === 'gameover') return { ...menu, screen: 'over' };
    return { ...menu };
  }
  if (menu.screen === 'paused') {
    if (action === 'pause' || action === 'select') return { ...menu, screen: 'playing' };
    if (action === 'back') return { ...menu, screen: 'title' };
    return { ...menu };
  }
  if (menu.screen === 'over') {
    if (action === 'select') return { ...menu, screen: 'title' };
    return { ...menu };
  }
  return { ...menu };
}

export function hudText(state) {
  return [
    'SCORE ' + state.score,
    'LIVES ' + state.lives,
    'MERGES ' + state.merges + '/' + state.level.quorum,
    'LEVEL ' + (state.levelIndex + 1),
  ];
}
