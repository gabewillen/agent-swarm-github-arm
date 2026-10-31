// Menus and HUD text (DESIGN.md §14).
//
// The menu is plain state and a pure reducer, so the page can keep it next
// to the game state and step both the same way. Every function here is
// pure: nothing is read or written outside its arguments.

const TITLE_ITEMS = 5;

// The first menu: the title screen, nothing selected but the first item,
// sound on, and the campaign as the mode a plain Play starts.
export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

// The title screen's five items, in order. The last one names the sound
// setting, so it reads `Sound: on` or `Sound: off`.
export function menuItems(menu) {
  return [
    'Play',
    'Daily run',
    'Level editor',
    'How to play',
    `Sound: ${menu.sound ? 'on' : 'off'}`,
  ];
}

// Returns the next menu for one action, leaving the argument untouched.
// Actions are 'up', 'down', 'select', 'back', 'pause', and 'gameover';
// any other, or an action a screen does not handle, leaves the menu as it
// was (as a fresh copy).
export function menuReduce(menu, action) {
  const next = { ...menu };

  switch (action) {
    case 'up': {
      if (menu.screen === 'title') {
        next.selected = (menu.selected + TITLE_ITEMS - 1) % TITLE_ITEMS;
      }
      return next;
    }
    case 'down': {
      if (menu.screen === 'title') {
        next.selected = (menu.selected + 1) % TITLE_ITEMS;
      }
      return next;
    }
    case 'select': {
      if (menu.screen === 'title') {
        switch (menu.selected) {
          case 0:
            next.screen = 'playing';
            next.mode = 'campaign';
            break;
          case 1:
            next.screen = 'playing';
            next.mode = 'daily';
            break;
          case 2:
            next.screen = 'editor';
            break;
          case 3:
            next.screen = 'help';
            break;
          default: // item 4 flips the sound setting and stays here
            next.sound = !menu.sound;
        }
      } else if (menu.screen === 'help') {
        next.screen = 'title';
      } else if (menu.screen === 'editor') {
        next.screen = 'playing';
        next.mode = 'custom'; // play the edited level
      } else if (menu.screen === 'paused') {
        next.screen = 'playing';
      } else if (menu.screen === 'over') {
        next.screen = 'title';
      }
      return next;
    }
    case 'back': {
      if (
        menu.screen === 'help' ||
        menu.screen === 'editor' ||
        menu.screen === 'paused'
      ) {
        next.screen = 'title';
      }
      return next;
    }
    case 'pause': {
      if (menu.screen === 'playing') {
        next.screen = 'paused';
      } else if (menu.screen === 'paused') {
        next.screen = 'playing';
      }
      return next;
    }
    case 'gameover': {
      if (menu.screen === 'playing') {
        next.screen = 'over';
      }
      return next;
    }
    default:
      return next;
  }
}

// The four HUD lines for a game state. The merge line reads the current
// level's quorum, and the level line is one-based.
export function hudText(state) {
  const quorum =
    state.level && state.level.quorum !== undefined
      ? state.level.quorum
      : state.quorum;
  return [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `MERGES ${state.merges}/${quorum}`,
    `LEVEL ${state.levelIndex + 1}`,
  ];
}
