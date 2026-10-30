import test from 'node:test';
import assert from 'node:assert/strict';
import { load, mulberry, mulberryInt } from './helpers.mjs';

test('rngNext returns a value in [0, 1) and a uint32 seed', async () => {
  const { rngNext } = await load('core/rng.js');
  const r = rngNext(12345);
  assert.ok(r.value >= 0 && r.value < 1);
  assert.ok(Number.isInteger(r.seed) && r.seed >= 0 && r.seed <= 0xFFFFFFFF);
});

test('rngNext matches mulberry32 exactly (DESIGN.md §3)', async () => {
  const { rngNext } = await load('core/rng.js');
  for (const seed of [0, 1, 42, 123456789, 0xFFFFFFFF, 0x6D2B79F5]) {
    assert.deepEqual(rngNext(seed), mulberry(seed));
  }
});

test('rngNext is deterministic', async () => {
  const { rngNext } = await load('core/rng.js');
  assert.deepEqual(rngNext(99), rngNext(99));
});

test('rngNext chains through a thousand draws like the spec', async () => {
  const { rngNext } = await load('core/rng.js');
  let a = 7;
  let b = 7;
  for (let i = 0; i < 1000; i++) {
    const x = rngNext(a);
    const y = mulberry(b);
    assert.equal(x.value, y.value);
    a = x.seed;
    b = y.seed;
  }
});

test('rngNext values spread over [0, 1)', async () => {
  const { rngNext } = await load('core/rng.js');
  const buckets = new Array(10).fill(0);
  let s = 2024;
  for (let i = 0; i < 5000; i++) {
    const r = rngNext(s);
    s = r.seed;
    buckets[Math.floor(r.value * 10)]++;
  }
  for (const b of buckets) assert.ok(b > 350 && b < 650, `bucket ${b}`);
});

test('rngInt returns an integer in [0, n)', async () => {
  const { rngInt } = await load('core/rng.js');
  let s = 5;
  for (let i = 0; i < 500; i++) {
    const r = rngInt(s, 7);
    assert.ok(Number.isInteger(r.value) && r.value >= 0 && r.value < 7);
    s = r.seed;
  }
});

test('rngInt matches the spec', async () => {
  const { rngInt } = await load('core/rng.js');
  for (const seed of [3, 77, 4000000000]) {
    for (const n of [1, 2, 4, 13]) assert.deepEqual(rngInt(seed, n), mulberryInt(seed, n));
  }
});

test('rngInt with n = 1 is always 0', async () => {
  const { rngInt } = await load('core/rng.js');
  assert.equal(rngInt(31337, 1).value, 0);
});
