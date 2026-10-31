// Menus and the HUD text (DESIGN.md §14).
//
// Pure: menus are plain JSON data, and every reduce returns a new menu and
// never touches its argument. Rendering reads them through menuItems and
// hudText; nothing here touches the DOM.

const TITLE_ITEMS = ['Play', 'Daily run', 'Level editor', 'How to play'];
const TITLE_COUNT = TITLE_ITEMS.length + 1; // plus the sound toggle

export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

// The title screen's items, with the sound toggle last.
export function menuItems(menu) {
  const sound = menu && menu.sound ? 'Sound: on' : 'Sound: off';
  return [...TITLE_ITEMS, sound];
}

// One action on one menu: a new menu. Unknown actions, and actions the
// current screen does not know, leave the menu as it was.
export function menuReduce(menu, action) {
  const screen = menu ? menu.screen : undefined;

  if (screen === 'title') {
    const selected = menu.selected;
    if (action === 'up') return { ...menu, selected: (selected + TITLE_COUNT - 1) % TITLE_COUNT };
    if (action === 'down') return { ...menu, selected: (selected + 1) % TITLE_COUNT };
    if (action === 'select') {
      if (selected === 0) return { ...menu, screen: 'playing', mode: 'campaign' };
      if (selected === 1) return { ...menu, screen: 'playing', mode: 'daily' };
      if (selected === 2) return { ...menu, screen: 'editor' };
      if (selected === 3) return { ...menu, screen: 'help' };
      return { ...menu, sound: !menu.sound };
    }
    return menu;
  }

  if (screen === 'help') {
    if (action === 'back' || action === 'select') return { ...menu, screen: 'title' };
    return menu;
  }

  if (screen === 'editor') {
    if (action === 'back') return { ...menu, screen: 'title' };
    if (action === 'select') return { ...menu, screen: 'playing', mode: 'custom' };
    return menu;
  }

  if (screen === 'playing') {
    if (action === 'pause') return { ...menu, screen: 'paused' };
    if (action === 'gameover') return { ...menu, screen: 'over' };
    return menu;
  }

  if (screen === 'paused') {
    if (action === 'pause' || action === 'select') return { ...menu, screen: 'playing' };
    if (action === 'back') return { ...menu, screen: 'title' };
    return menu;
  }

  if (screen === 'over') {
    if (action === 'select') return { ...menu, screen: 'title' };
    return menu;
  }

  return menu;
}

// The HUD's four lines over the play field.
export function hudText(state) {
  const s = state || {};
  const level = s.level || {};
  const merges = s.merges === undefined ? 0 : s.merges;
  const quorum = level.quorum === undefined ? 0 : level.quorum;
  const levelIndex = s.levelIndex === undefined ? 0 : s.levelIndex;
  const score = s.score === undefined ? 0 : s.score;
  const lives = s.lives === undefined ? 0 : s.lives;
  return [`SCORE ${score}`, `LIVES ${lives}`, `MERGES ${merges}/${quorum}`, `LEVEL ${levelIndex + 1}`];
}
