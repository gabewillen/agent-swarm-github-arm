// Menus and HUD text (DESIGN.md §14).
//
// The menu is a small immutable record: `{ screen, selected, sound, mode }`.
// Screens are 'title', 'playing', 'paused', 'help', 'editor', and 'over'.
// `menuReduce` maps an input action to the next menu and never changes its
// argument; unknown actions leave the menu as it was. The title screen has
// five items (§14): Play, Daily run, Level editor, How to play, Sound.

/**
 * The menu state when the game opens.
 * @returns {{ screen: 'title', selected: 0, sound: true, mode: 'campaign' }}
 */
export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

/** The five title-screen items, the sound item reflecting the setting. */
export function menuItems(menu) {
  return ['Play', 'Daily run', 'Level editor', 'How to play', `Sound: ${menu.sound ? 'on' : 'off'}`];
}

/** A copy of the menu: same fields, fresh object. */
function copy(menu) {
  return { ...menu };
}

/**
 * The next menu for one action. Actions are 'up', 'down', 'select',
 * 'back', 'pause', and 'gameover'; anything else leaves the menu as it
 * was. Actions that have no effect on the current screen leave it too.
 * @param {{ screen?: string, selected?: number, sound?: boolean, mode?: string }} menu
 * @param {string} action
 */
export function menuReduce(menu, action) {
  const next = copy(menu);
  const { screen, selected } = next;
  switch (action) {
    case 'up':
      if (screen === 'title') {
        next.selected = (((selected - 1) % 5) + 5) % 5;
      }
      break;
    case 'down':
      if (screen === 'title') {
        next.selected = (((selected + 1) % 5) + 5) % 5;
      }
      break;
    case 'select':
      if (screen === 'title') {
        if (selected === 0) {
          next.screen = 'playing';
          next.mode = 'campaign';
        } else if (selected === 1) {
          next.screen = 'playing';
          next.mode = 'daily';
        } else if (selected === 2) {
          next.screen = 'editor';
        } else if (selected === 3) {
          next.screen = 'help';
        } else if (selected === 4) {
          next.sound = !next.sound;
        }
      } else if (screen === 'editor') {
        // Play the level the editor holds.
        next.screen = 'playing';
        next.mode = 'custom';
      } else if (screen === 'paused') {
        // Selecting resumes a paused game.
        next.screen = 'playing';
      } else if (screen === 'help' || screen === 'over') {
        next.screen = 'title';
      }
      break;
    case 'back':
      if (screen === 'help' || screen === 'editor' || screen === 'paused') {
        next.screen = 'title';
      }
      break;
    case 'pause':
      if (screen === 'playing') {
        next.screen = 'paused';
      } else if (screen === 'paused') {
        next.screen = 'playing';
      }
      break;
    case 'gameover':
      if (screen === 'playing') {
        next.screen = 'over';
      }
      break;
    default:
      break;
  }
  return next;
}

/**
 * The HUD's text lines for a state: score, lives, merges against the
 * level's quorum, and the level number.
 * @param {{ score: number, lives: number, merges: number, levelIndex?: number,
 *            level?: { quorum?: number } | null }} state
 * @returns {string[]}
 */
export function hudText(state) {
  const quorum = state.level && state.level.quorum != null ? state.level.quorum : 0;
  const levelIndex = typeof state.levelIndex === 'number' ? state.levelIndex : 0;
  return [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `MERGES ${state.merges}/${quorum}`,
    `LEVEL ${levelIndex + 1}`,
  ];
}
