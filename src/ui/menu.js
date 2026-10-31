// Menus and HUD text (DESIGN.md §14). Pure: no DOM, no imports.

export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

export function menuItems(menu) {
  const sound = menu.sound ? 'on' : 'off';
  return ['Play', 'Daily run', 'Level editor', 'How to play', `Sound: ${sound}`];
}

const TITLE_COUNT = 5;

export function menuReduce(menu, action) {
  const next = { ...menu };
  if (menu.screen === 'title') {
    if (action === 'up') {
      next.selected = (menu.selected - 1 + TITLE_COUNT) % TITLE_COUNT;
      return next;
    }
    if (action === 'down') {
      next.selected = (menu.selected + 1) % TITLE_COUNT;
      return next;
    }
    if (action === 'select') {
      if (menu.selected === 0) return { ...menu, screen: 'playing', mode: 'campaign' };
      if (menu.selected === 1) return { ...menu, screen: 'playing', mode: 'daily' };
      if (menu.selected === 2) return { ...menu, screen: 'editor' };
      if (menu.selected === 3) return { ...menu, screen: 'help' };
      if (menu.selected === 4) return { ...menu, sound: !menu.sound };
      return next;
    }
  }
  if (menu.screen === 'help') {
    if (action === 'back' || action === 'select') return { ...menu, screen: 'title' };
  }
  if (menu.screen === 'editor') {
    if (action === 'back') return { ...menu, screen: 'title' };
    if (action === 'select') return { ...menu, screen: 'playing', mode: 'custom' };
  }
  if (menu.screen === 'playing') {
    if (action === 'pause') return { ...menu, screen: 'paused' };
    if (action === 'gameover') return { ...menu, screen: 'over' };
  }
  if (menu.screen === 'paused') {
    if (action === 'pause' || action === 'select') return { ...menu, screen: 'playing' };
    if (action === 'back') return { ...menu, screen: 'title' };
  }
  if (menu.screen === 'over') {
    if (action === 'select') return { ...menu, screen: 'title' };
  }
  return next;
}

export function hudText(state) {
  const quorum = state.level ? state.level.quorum : (state.quorum ?? 0);
  return [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `MERGES ${state.merges}/${quorum}`,
    `LEVEL ${state.levelIndex + 1}`,
  ];
}
