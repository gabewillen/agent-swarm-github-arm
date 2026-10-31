// Quorum Run — menus, HUD (DESIGN.md §14). Pure: no DOM, no randomness.

// The menu is plain JSON data: { screen, selected, sound, mode }.

export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

// The title screen's item list; the sound item names the current setting.
const TITLE_ITEMS = ['Play', 'Daily run', 'Level editor', 'How to play'];

export function menuItems(menu) {
  return [...TITLE_ITEMS, menu && menu.sound ? 'Sound: on' : 'Sound: off'];
}

// A new menu, with every field of the old one carried over unless the
// transition changes it. Never changes the argument.
function carry(menu, patch) {
  return { ...menu, ...patch };
}

export function menuReduce(menu, action) {
  const m = menu || menuInit();
  switch (m.screen) {
    case 'title': {
      const items = TITLE_ITEMS.length + 1; // five items: four + the sound toggle
      if (action === 'up') {
        return carry(m, { selected: (m.selected + items - 1) % items });
      }
      if (action === 'down') {
        return carry(m, { selected: (m.selected + 1) % items });
      }
      if (action === 'select') {
        // Item 4 is the sound toggle; it stays on the title screen.
        if (m.selected === 4) return carry(m, { sound: !m.sound });
        if (m.selected === 3) return carry(m, { screen: 'help' });
        if (m.selected === 2) return carry(m, { screen: 'editor' });
        if (m.selected === 1) return carry(m, { screen: 'playing', mode: 'daily' });
        return carry(m, { screen: 'playing', mode: 'campaign' });
      }
      return carry(m);
    }
    case 'help':
      if (action === 'back' || action === 'select') {
        return carry(m, { screen: 'title' });
      }
      return carry(m);
    case 'editor':
      if (action === 'back') return carry(m, { screen: 'title' });
      if (action === 'select') return carry(m, { screen: 'playing', mode: 'custom' });
      return carry(m);
    case 'playing':
      if (action === 'pause') return carry(m, { screen: 'paused' });
      if (action === 'gameover') return carry(m, { screen: 'over' });
      return carry(m);
    case 'paused':
      if (action === 'pause' || action === 'select') {
        return carry(m, { screen: 'playing' });
      }
      if (action === 'back') return carry(m, { screen: 'title' });
      return carry(m);
    case 'over':
      if (action === 'select') return carry(m, { screen: 'title' });
      return carry(m);
    default:
      return carry(m);
  }
}

// The four HUD strings, from the state's score, lives, merge count, and
// level index.
export function hudText(state) {
  const s = state || {};
  const level = s.level || s;
  const quorum = level.quorum != null ? level.quorum : s.quorum;
  return [
    `SCORE ${s.score}`,
    `LIVES ${s.lives}`,
    `MERGES ${s.merges}/${quorum}`,
    `LEVEL ${(s.levelIndex || 0) + 1}`,
  ];
}
