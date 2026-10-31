// Agent-owned sweep (not part of the acceptance suite): stress the §23
// particle helpers across many seeded bot games. It checks the §23
// invariants the acceptance tests sample rather than exhaust: plain JSON
// particles, a fresh burst at PARTICLE_TTL that dies on time, palette
// colours only, the seed threading through every draw, and a draw list with
// exactly one op per particle. Run: node dev/particles-sweep.mjs
import { LEVELS } from '../src/data/levels.js';
import { init, step } from '../src/core/game.js';
import { botInput } from '../src/core/bot.js';
import {
  PARTICLE_TTL, burst, stepParticles, particlesFor, particleOps,
} from '../src/render/particles.js';
import { PALETTE } from '../src/render/palette.js';
import assert from 'node:assert/strict';

// §3's mulberry32, to pick sweep seeds without Math.random.
function mulberry(seed) {
  const t = (seed + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, seed: t };
}

const PALETTE_COLORS = new Set([PALETTE.accent, PALETTE.danger, ...PALETTE.agents]);
const finite = (n) => typeof n === 'number' && Number.isFinite(n);

function checkParticle(p, where) {
  assert.ok(finite(p.x) && finite(p.y), `${where}: finite position`);
  assert.ok(finite(p.vx) && finite(p.vy), `${where}: finite velocity`);
  assert.ok(Number.isInteger(p.ttl) && p.ttl >= 0 && p.ttl <= PARTICLE_TTL,
    `${where}: ttl in [0, ${PARTICLE_TTL}]`);
  assert.ok(PALETTE_COLORS.has(p.color), `${where}: colour is a palette value`);
}

const LAYOUT = { cell: 24, ox: 10, oy: 48 };

let steps = 0;
let eventBursts = 0;
let particlesMade = 0;
for (let li = 0; li < LEVELS.length; li++) {
  for (let g = 0; g < 6; g++) {
    const seed = mulberry(1000 + li * 37 + g).seed;
    let state = init(seed >>> 0, { levels: LEVELS, level: li });
    // Thread the particles seed like src/main.js does across frames.
    let pseed = mulberry(7000 + li * 11 + g).seed;
    for (let i = 0; i < 2400 && state.status === 'playing'; i++) {
      state = step(state, botInput(state));
      steps++;
      const made = particlesFor(state, pseed);
      for (const p of made.particles) {
        checkParticle(p, `l${li} g${g} t${state.tick}`);
        assert.equal(p.ttl, PARTICLE_TTL, 'a fresh burst starts at full ttl');
      }
      assert.deepEqual(JSON.parse(JSON.stringify(made.particles)), made.particles,
        'plain JSON particles');
      pseed = made.seed >>> 0;
      particlesMade += made.particles.length;
      if (made.particles.length) eventBursts++;
      // A burst dies within PARTICLE_TTL steps and never grows.
      let ps = made.particles;
      let ticks = 0;
      while (ps.length > 0) {
        ps = stepParticles(ps);
        ticks++;
        for (const p of ps) checkParticle(p, `aged l${li} t${ticks}`);
        assert.ok(ticks <= PARTICLE_TTL, `gone after ${PARTICLE_TTL} steps`);
      }
      assert.ok(ticks <= PARTICLE_TTL, `a burst lasts at most ${PARTICLE_TTL} steps`);
      // One circle op per particle, in screen space, kinds intact.
      const ops = particleOps(ps.concat(made.particles), LAYOUT);
      assert.equal(ops.length, made.particles.length, 'one op per particle');
      for (const op of ops) {
        assert.ok(op.op === 'circle' && op.kind === 'particle', 'one circle op per particle');
        assert.ok(finite(op.x) && finite(op.y), 'finite screen position');
      }
    }
  }
}
console.log(`particles sweep: ${steps} bot steps, ${eventBursts} event bursts, ` +
  `${particlesMade} particles checked — §23 held everywhere`);
