// Menus and HUD text (DESIGN.md §14).
//
// The menu is plain data: { screen, selected, sound, mode }. `screen` is
// one of 'title', 'playing', 'help', 'editor', 'paused', 'over';
// `selected` is the highlighted title item (0 to 4); `sound` is the
// sound toggle shown as the fifth title item; `mode` is 'campaign',
// 'daily', or 'custom', set by the way play was started.
//
// Everything here is pure: no DOM, no imports, and `menuReduce` never
// changes its argument — it returns a new menu every time.

// The title screen's items, in order.
export function menuItems(menu) {
  return ['Play', 'Daily run', 'Level editor', 'How to play', `Sound: ${menu.sound ? 'on' : 'off'}`];
}

// The first menu: the title screen, Play highlighted, sound on.
export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

const ITEM_COUNT = 5;

// Actions are 'up', 'down', 'select', 'back', 'pause', 'gameover'; any
// other action (or one a screen doesn't handle) leaves the menu as it
// was. Returns a new menu; never changes `menu`.
export function menuReduce(menu, action) {
  const next = { ...menu };
  switch (menu.screen) {
    case 'title':
      if (action === 'up') {
        next.selected = (menu.selected + ITEM_COUNT - 1) % ITEM_COUNT;
      } else if (action === 'down') {
        next.selected = (menu.selected + 1) % ITEM_COUNT;
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
        } else if (menu.selected === 4) {
          next.sound = !menu.sound;
        }
      }
      return next;
    case 'help':
      if (action === 'back' || action === 'select') next.screen = 'title';
      return next;
    case 'editor':
      if (action === 'back') next.screen = 'title';
      else if (action === 'select') {
        next.screen = 'playing';
        next.mode = 'custom';
      }
      return next;
    case 'playing':
      if (action === 'pause') next.screen = 'paused';
      else if (action === 'gameover') next.screen = 'over';
      return next;
    case 'paused':
      if (action === 'pause' || action === 'select') next.screen = 'playing';
      else if (action === 'back') next.screen = 'title';
      return next;
    case 'over':
      if (action === 'select') next.screen = 'title';
      return next;
    default:
      return next;
  }
}

// The HUD's four lines: score, lives, merges over quorum, level number
// (1-based).
export function hudText(state) {
  const quorum = state.level && state.level.quorum != null ? state.level.quorum : 0;
  return [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `MERGES ${state.merges}/${quorum}`,
    `LEVEL ${(state.levelIndex ?? 0) + 1}`,
  ];
}
