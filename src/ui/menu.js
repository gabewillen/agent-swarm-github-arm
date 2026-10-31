// Menus and HUD text (DESIGN.md §14). Pure: no DOM, no randomness, and
// menuReduce never changes the menu it is given.

export function menuInit() {
  return { screen: 'title', selected: 0, sound: true, mode: 'campaign' };
}

export function menuItems(menu) {
  return ['Play', 'Daily run', 'Level editor', 'How to play',
    `Sound: ${menu.sound ? 'on' : 'off'}`];
}

export function menuReduce(menu, action) {
  const m = { ...menu };
  switch (action) {
    case 'up':
    case 'down':
      if (m.screen === 'title') {
        const from = m.selected;
        m.selected = action === 'up'
          ? (from + 4) % 5
          : (from + 1) % 5;
      }
      return m;
    case 'select':
      if (m.screen === 'title') {
        switch (m.selected) {
          case 0:
            m.screen = 'playing';
            m.mode = 'campaign';
            return m;
          case 1:
            m.screen = 'playing';
            m.mode = 'daily';
            return m;
          case 2:
            m.screen = 'editor';
            return m;
          case 3:
            m.screen = 'help';
            return m;
          case 4:
            m.sound = !m.sound;
            return m;
          default:
            return m;
        }
      }
      if (m.screen === 'help') {
        m.screen = 'title';
        return m;
      }
      if (m.screen === 'paused') {
        m.screen = 'playing';
        return m;
      }
      if (m.screen === 'over') {
        m.screen = 'title';
        return m;
      }
      if (m.screen === 'editor') {
        m.screen = 'playing';
        m.mode = 'custom';
        return m;
      }
      return m;
    case 'back':
      if (m.screen === 'paused' || m.screen === 'help' || m.screen === 'editor') {
        m.screen = 'title';
        return m;
      }
      return m;
    case 'pause':
      if (m.screen === 'playing') {
        m.screen = 'paused';
        return m;
      }
      if (m.screen === 'paused') {
        m.screen = 'playing';
        return m;
      }
      return m;
    case 'gameover':
      if (m.screen === 'playing') {
        m.screen = 'over';
        return m;
      }
      return m;
    default:
      return m;
  }
}

export function hudText(state) {
  return [
    `SCORE ${state.score}`,
    `LIVES ${state.lives}`,
    `MERGES ${state.merges}/${state.level.quorum}`,
    `LEVEL ${state.levelIndex + 1}`,
  ];
}
