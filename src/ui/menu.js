// Quorum Run: menus and HUD text (DESIGN.md §14).
// Pure UI state: `menuInit` makes the first menu, `menuReduce` applies an
// action to it (never changing its argument), `menuItems` names the title
// screen's items, and `hudText` renders the HUD strip of a game state.

const ITEM_COUNT = 5;

// The first menu: the title screen, nothing selected but item 0, sound on,
// campaign mode.
export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

// The title screen's items, in order; the sound item reflects the setting.
export function menuItems(menu) {
  const sound = !!(menu && menu.sound);
  return [
    'Play',
    'Daily run',
    'Level editor',
    'How to play',
    'Sound: ' + (sound ? 'on' : 'off'),
  ];
}

// A new menu with `action` applied to `menu`; the argument is never
// changed, and an action the current screen does not handle (or no action
// at all) leaves the menu as it was.
export function menuReduce(menu, action) {
  const m = { ...menu };
  switch (action) {
    case 'up':
      if (m.screen === 'title') {
        m.selected = ((m.selected % ITEM_COUNT) + ITEM_COUNT - 1) % ITEM_COUNT;
      }
      break;
    case 'down':
      if (m.screen === 'title') {
        m.selected = (m.selected + 1) % ITEM_COUNT;
      }
      break;
    case 'select':
      if (m.screen === 'title') {
        switch (m.selected) {
          case 0:
            m.screen = 'playing';
            m.mode = 'campaign';
            break;
          case 1:
            m.screen = 'playing';
            m.mode = 'daily';
            break;
          case 2:
            m.screen = 'editor';
            break;
          case 3:
            m.screen = 'help';
            break;
          default:
            m.sound = !m.sound;
            break;
        }
      } else if (m.screen === 'help') {
        m.screen = 'title';
      } else if (m.screen === 'editor') {
        m.screen = 'playing';
        m.mode = 'custom';
      } else if (m.screen === 'paused') {
        m.screen = 'playing';
      } else if (m.screen === 'over') {
        m.screen = 'title';
      }
      break;
    case 'back':
      if (m.screen === 'help' || m.screen === 'editor' || m.screen === 'paused') {
        m.screen = 'title';
      }
      break;
    case 'pause':
      if (m.screen === 'playing') m.screen = 'paused';
      else if (m.screen === 'paused') m.screen = 'playing';
      break;
    case 'gameover':
      if (m.screen === 'playing') m.screen = 'over';
      break;
    default:
      break;
  }
  return m;
}

// The HUD strip's four fields for a game state.
export function hudText(state) {
  const s = state ?? {};
  const level = s.level ?? {};
  return [
    'SCORE ' + (s.score ?? 0),
    'LIVES ' + (s.lives ?? 0),
    'MERGES ' + (s.merges ?? 0) + '/' + (level.quorum ?? 0),
    'LEVEL ' + ((s.levelIndex ?? 0) + 1),
  ];
}
