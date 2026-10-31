// Quorum Run: menus and HUD text (DESIGN.md §14).
//
// A menu is a small plain object `{ screen, selected, sound, mode }`. The
// screens are 'title', 'playing', 'paused', 'help', 'editor', and 'over'.
// `menuReduce` is a pure reducer: it never changes its argument and always
// hands back a fresh object holding the same fields, with unknown actions
// leaving the menu exactly as it was. This module touches nothing but the
// data it is given: pure functions only.

// The title screen has five items, so the selector wraps over five.
const ITEMS = 5;

// §14: the initial menu — title screen, first item, sound on, campaign.
export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

// §14: the title screen's items, with the sound setting on the last item.
export function menuItems(menu) {
  return [
    'Play',
    'Daily run',
    'Level editor',
    'How to play',
    'Sound: ' + (menu.sound ? 'on' : 'off'),
  ];
}

// §14: reduce one action. An unknown action is a copy, unchanged.
export function menuReduce(menu, action) {
  const next = { ...menu };
  switch (action) {
    case 'up':
      if (menu.screen === 'title') next.selected = (menu.selected + ITEMS - 1) % ITEMS;
      return next;

    case 'down':
      if (menu.screen === 'title') next.selected = (menu.selected + 1) % ITEMS;
      return next;

    case 'select':
      if (menu.screen === 'title') {
        switch (menu.selected) {
          case 0: return { ...next, screen: 'playing', mode: 'campaign' };
          case 1: return { ...next, screen: 'playing', mode: 'daily' };
          case 2: return { ...next, screen: 'editor' };
          case 3: return { ...next, screen: 'help' };
          case 4: return { ...next, sound: !menu.sound };
          default: return next;
        }
      }
      if (menu.screen === 'editor') return { ...next, screen: 'playing', mode: 'custom' };
      if (menu.screen === 'help') return { ...next, screen: 'title' };
      if (menu.screen === 'paused') return { ...next, screen: 'playing' };
      if (menu.screen === 'over') return { ...next, screen: 'title' };
      return next;

    case 'back':
      if (menu.screen === 'editor' || menu.screen === 'help' || menu.screen === 'paused') {
        return { ...next, screen: 'title' };
      }
      return next;

    case 'pause':
      if (menu.screen === 'playing') return { ...next, screen: 'paused' };
      if (menu.screen === 'paused') return { ...next, screen: 'playing' };
      return next;

    case 'gameover':
      if (menu.screen === 'playing') return { ...next, screen: 'over' };
      return next;

    default:
      return next;
  }
}

// §14: the HUD's four strings, from a game state.
export function hudText(state) {
  return [
    'SCORE ' + state.score,
    'LIVES ' + state.lives,
    'MERGES ' + state.merges + '/' + state.level.quorum,
    'LEVEL ' + (state.levelIndex + 1),
  ];
}
