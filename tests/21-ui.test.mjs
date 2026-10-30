import test from 'node:test';
import assert from 'node:assert/strict';
import { load, game, deepFreeze } from './helpers.mjs';

const menu = () => load('ui/menu.js');

test('menuInit starts on the title', async () => {
  assert.deepEqual((await menu()).menuInit(), { screen: 'title', selected: 0, sound: true, mode: 'campaign' });
});

test('menuItems lists the title items with the sound setting', async () => {
  const { menuItems, menuInit } = await menu();
  assert.deepEqual(menuItems(menuInit()), ['Play', 'Daily run', 'Level editor', 'How to play', 'Sound: on']);
  assert.deepEqual(menuItems({ ...menuInit(), sound: false }), ['Play', 'Daily run', 'Level editor', 'How to play', 'Sound: off']);
});

test('up and down wrap around the five items', async () => {
  const { menuReduce, menuInit } = await menu();
  let m = menuInit();
  m = menuReduce(m, 'up');
  assert.equal(m.selected, 4);
  m = menuReduce(m, 'down');
  assert.equal(m.selected, 0);
  for (let i = 0; i < 4; i++) m = menuReduce(m, 'down');
  assert.equal(m.selected, 4);
  assert.equal(menuReduce(m, 'down').selected, 0);
});

test('select on Play starts the campaign', async () => {
  const { menuReduce, menuInit } = await menu();
  const m = menuReduce({ ...menuInit(), mode: 'daily' }, 'select');
  assert.equal(m.screen, 'playing');
  assert.equal(m.mode, 'campaign');
});

test('select on Daily run starts the daily mode', async () => {
  const { menuReduce, menuInit } = await menu();
  const m = menuReduce({ ...menuInit(), selected: 1 }, 'select');
  assert.equal(m.screen, 'playing');
  assert.equal(m.mode, 'daily');
});

test('the level editor opens, plays its level, and goes back', async () => {
  const { menuReduce, menuInit } = await menu();
  const ed = menuReduce({ ...menuInit(), selected: 2 }, 'select');
  assert.equal(ed.screen, 'editor');
  assert.equal(menuReduce(ed, 'back').screen, 'title');
  const play = menuReduce(ed, 'select');
  assert.equal(play.screen, 'playing');
  assert.equal(play.mode, 'custom');
});

test('select on How to play opens help, and back or select returns', async () => {
  const { menuReduce, menuInit } = await menu();
  const help = menuReduce({ ...menuInit(), selected: 3 }, 'select');
  assert.equal(help.screen, 'help');
  assert.equal(menuReduce(help, 'back').screen, 'title');
  assert.equal(menuReduce(help, 'select').screen, 'title');
});

test('select on Sound flips it and stays on the title', async () => {
  const { menuReduce, menuInit } = await menu();
  const m = menuReduce({ ...menuInit(), selected: 4 }, 'select');
  assert.equal(m.screen, 'title');
  assert.equal(m.sound, false);
  assert.equal(menuReduce(m, 'select').sound, true);
});

test('pause and resume while playing', async () => {
  const { menuReduce } = await menu();
  const playing = { screen: 'playing', selected: 0, sound: true, mode: 'campaign' };
  const paused = menuReduce(playing, 'pause');
  assert.equal(paused.screen, 'paused');
  assert.equal(menuReduce(paused, 'pause').screen, 'playing');
  assert.equal(menuReduce(paused, 'select').screen, 'playing');
  assert.equal(menuReduce(paused, 'back').screen, 'title');
});

test('game over and back to the title', async () => {
  const { menuReduce } = await menu();
  const over = menuReduce({ screen: 'playing', selected: 0, sound: true, mode: 'campaign' }, 'gameover');
  assert.equal(over.screen, 'over');
  assert.equal(menuReduce(over, 'select').screen, 'title');
});

test('unknown actions leave the menu as it was, and the argument is never changed', async () => {
  const { menuReduce, menuInit } = await menu();
  const m = deepFreeze(menuInit());
  assert.deepEqual(menuReduce(m, 'dance'), m);
  assert.deepEqual(menuReduce(m, 'pause'), m);
  menuReduce(m, 'down');
  assert.equal(m.selected, 0);
});

test('hudText gives score, lives, merges, and level', async () => {
  const { hudText } = await menu();
  const s = await game(['#######', '#@.P.M#', '#..X..#', '#######'], { quorum: 4 });
  assert.deepEqual(hudText({ ...s, score: 50, lives: 2, merges: 3 }), ['SCORE 50', 'LIVES 2', 'MERGES 3/4', 'LEVEL 1']);
});
