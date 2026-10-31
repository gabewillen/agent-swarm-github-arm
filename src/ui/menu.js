// Menus and HUD (DESIGN.md §14). Pure reducers over the menu state: no DOM,
// no rendering, no imports. The page (src/main.js) drives screens with
// menuReduce and renders menuItems and hudText.

// menuInit() -> { screen: 'title', selected: 0, sound: true, mode: 'campaign' }
export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

// The title screen's items: the sound line depends on menu.sound.
export function menuItems(menu) {
  return [
    'Play',
    'Daily run',
    'Level editor',
    'How to play',
    menu.sound ? 'Sound: on' : 'Sound: off',
  ];
}

const ITEMS = 5;

const wrap = (selected) => ((selected % ITEMS) + ITEMS) % ITEMS;

// menuReduce(menu, action) -> a new menu; menu is never changed.
// Actions: 'up', 'down', 'select', 'back', 'pause', 'gameover'; any other
// leaves the menu as it was.
export function menuReduce(menu, action) {
  // Unknown actions (and no handled transition below) leave the menu as it
  // was, returned as a new object.
  const same = () => ({ ...menu });
  const screen = menu.screen;

  // Title: up and down move the selection with wrap-around.
  if (screen === 'title') {
    if (action === 'up') return { ...menu, selected: wrap(menu.selected - 1) };
    if (action === 'down') return { ...menu, selected: wrap(menu.selected + 1) };
    if (action === 'select') {
      switch (menu.selected) {
        case 0: return { ...menu, screen: 'playing', mode: 'campaign' };
        case 1: return { ...menu, screen: 'playing', mode: 'daily' };
        case 2: return { ...menu, screen: 'editor' };
        case 3: return { ...menu, screen: 'help' };
        case 4: return { ...menu, sound: !menu.sound };
        default: return same();
      }
    }
    return same();
  }

  if (screen === 'help') {
    if (action === 'back' || action === 'select') return { ...menu, screen: 'title' };
    return same();
  }

  if (screen === 'editor') {
    if (action === 'back') return { ...menu, screen: 'title' };
    if (action === 'select') return { ...menu, screen: 'playing', mode: 'custom' };
    return same();
  }

  if (screen === 'playing') {
    if (action === 'pause') return { ...menu, screen: 'paused' };
    if (action === 'gameover') return { ...menu, screen: 'over' };
    return same();
  }

  if (screen === 'paused') {
    if (action === 'pause' || action === 'select') return { ...menu, screen: 'playing' };
    if (action === 'back') return { ...menu, screen: 'title' };
    return same();
  }

  if (screen === 'over') {
    if (action === 'select') return { ...menu, screen: 'title' };
    return same();
  }

  return same();
}

// The HUD strip's text, one entry per line the renderer draws.
export function hudText(state) {
  return [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `MERGES ${state.merges}/${state.quorum}`,
    `LEVEL ${(state.levelIndex ?? 0) + 1}`,
  ];
}
