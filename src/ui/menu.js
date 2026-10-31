// Quorum Run — menus and HUD text (DESIGN.md §14).
//
// A menu is plain JSON data: `{ screen, selected, sound, mode }`. Every
// reducer here returns a new menu and never changes its argument, so the
// core can hold it as part of the page state without copying concerns.
//
// Screens and actions follow §14's table exactly; any action not listed
// for the current screen leaves the menu as it was.

const S = {
  TITLE: 'title',
  HELP: 'help',
  EDITOR: 'editor',
  PLAYING: 'playing',
  PAUSED: 'paused',
  OVER: 'over',
};

export function menuInit() {
  return { screen: S.TITLE, selected: 0, sound: true, mode: 'campaign' };
}

export function menuItems(menu) {
  return [
    'Play',
    'Daily run',
    'Level editor',
    'How to play',
    `Sound: ${menu.sound ? 'on' : 'off'}`,
  ];
}

export function menuReduce(menu, action) {
  switch (menu.screen) {
    case S.TITLE: {
      if (action === 'up' || action === 'down') {
        const count = menuItems(menu).length;
        const step = action === 'down' ? 1 : -1;
        return { ...menu, selected: (menu.selected + step + count) % count };
      }
      if (action === 'select') {
        switch (menu.selected) {
          case 0: return { ...menu, screen: S.PLAYING, mode: 'campaign' };
          case 1: return { ...menu, screen: S.PLAYING, mode: 'daily' };
          case 2: return { ...menu, screen: S.EDITOR };
          case 3: return { ...menu, screen: S.HELP };
          case 4: return { ...menu, sound: !menu.sound };
          default: return menu;
        }
      }
      return menu;
    }
    case S.HELP:
      if (action === 'back' || action === 'select') return { ...menu, screen: S.TITLE };
      return menu;
    case S.EDITOR:
      if (action === 'back') return { ...menu, screen: S.TITLE };
      if (action === 'select') return { ...menu, screen: S.PLAYING, mode: 'custom' };
      return menu;
    case S.PLAYING:
      if (action === 'pause') return { ...menu, screen: S.PAUSED };
      if (action === 'gameover') return { ...menu, screen: S.OVER };
      return menu;
    case S.PAUSED:
      if (action === 'pause' || action === 'select') return { ...menu, screen: S.PLAYING };
      if (action === 'back') return { ...menu, screen: S.TITLE };
      return menu;
    case S.OVER:
      if (action === 'select') return { ...menu, screen: S.TITLE };
      return menu;
    default:
      return menu;
  }
}

// `hudText(state)` returns the four HUD lines as strings. The quorum and
// level number come from the game state (§5): `state.level` is the parsed
// level, so its `quorum` is the level's own target.
export function hudText(state) {
  const quorum = state.level && typeof state.level.quorum === 'number'
    ? state.level.quorum
    : 0;
  const levelIndex = state.levelIndex ?? 0;
  return [
    `SCORE ${state.score ?? 0}`,
    `LIVES ${state.lives ?? 0}`,
    `MERGES ${state.merges ?? 0}/${quorum}`,
    `LEVEL ${levelIndex + 1}`,
  ];
}
