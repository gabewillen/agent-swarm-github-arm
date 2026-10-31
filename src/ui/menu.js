// Menus and HUD text (DESIGN.md §14). Pure: no DOM, no randomness, and it
// never changes its argument — every transition returns a fresh menu.

const TITLE_ITEM_COUNT = 5;

export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

export function menuItems(menu) {
  return [
    'Play',
    'Daily run',
    'Level editor',
    'How to play',
    menu.sound ? 'Sound: on' : 'Sound: off',
  ];
}

export function menuReduce(menu, action) {
  const next = { ...menu };
  const screen = menu.screen;
  if (screen === 'title') {
    if (action === 'up') {
      next.selected = (menu.selected + TITLE_ITEM_COUNT - 1) % TITLE_ITEM_COUNT;
    } else if (action === 'down') {
      next.selected = (menu.selected + 1) % TITLE_ITEM_COUNT;
    } else if (action === 'select') {
      if (menu.selected === 0) {
        next.screen = 'playing';
        next.mode = 'campaign';
      } else if (menu.selected === 1) {
        next.screen = 'playing';
        next.mode = 'daily';
      } else if (menu.selected === 2) {
        next.screen = 'editor';
      } else if (menu.selected === 3) {
        next.screen = 'help';
      } else {
        next.sound = !menu.sound;
      }
    }
    return next;
  }
  if (screen === 'help') {
    if (action === 'back' || action === 'select') next.screen = 'title';
    return next;
  }
  if (screen === 'editor') {
    if (action === 'back') next.screen = 'title';
    else if (action === 'select') {
      next.screen = 'playing';
      next.mode = 'custom';
    }
    return next;
  }
  if (screen === 'playing') {
    if (action === 'pause') next.screen = 'paused';
    else if (action === 'gameover') next.screen = 'over';
    return next;
  }
  if (screen === 'paused') {
    if (action === 'pause' || action === 'select') next.screen = 'playing';
    else if (action === 'back') next.screen = 'title';
    return next;
  }
  if (screen === 'over') {
    if (action === 'select') next.screen = 'title';
    return next;
  }
  return next;
}

export function hudText(state) {
  return [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `MERGES ${state.merges}/${state.level.quorum}`,
    `LEVEL ${state.levelIndex + 1}`,
  ];
}
