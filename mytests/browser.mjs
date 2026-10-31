// agent-37's page smoke: run the real src/main.js against a DOM shim and drive
// it the way a browser would (frames of requestAnimationFrame, real keydown
// events, real localStorage), then assert on what it draws and schedules. The
// acceptance tests load the modules but never execute the page (§1: no module
// but main.js touches the DOM), so wiring bugs like a render loop that never
// starts cannot show in tests/run.mjs. This harness exists to catch exactly
// that class of §15 bug: it is node-only glue and lives here in mytests/,
// not under tests/ and not in src/. Run: node mytests/browser.mjs

const drawLog = []; // { fn, args } — everything the page asked the canvas to paint
const textLog = []; // every text the page drew, in order

// --- a recording 2D context --------------------------------------------------
function makeCtx() {
  let font = '10px monospace';
  return {
    get font() { return font; },
    set font(v) { font = String(v); },
    fillRect(x, y, w, h) { drawLog.push({ fn: 'fillRect', args: [x, y, w, h] }); },
    fillText(text, x, y) {
      drawLog.push({ fn: 'fillText', args: [text, x, y] });
      textLog.push(String(text));
    },
    measureText(text) {
      const m = /^(\d+(?:\.\d+)?)px/.exec(font);
      const size = m ? +m[1] : 12;
      return { width: String(text).length * size * 0.6 };
    },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {},
    save() {}, restore() {}, translate() {}, rect() {}, clearRect() {}, ellipse() {},
    roundRect() {}, setLineDash() {},
    arc(x, y, r) { drawLog.push({ fn: 'arc', args: [x, y, r] }); },
  };
}

// --- a WebAudio shim (§13 cues and §24 music scheduling run for real) ---------
const audioStats = { contexts: 0, oscillators: 0, gains: 0 };
class FakeAudioContext {
  constructor() { audioStats.contexts += 1; }
  get currentTime() { return now / 1000; }
  get state() { return 'running'; }
  get destination() { return { fake: 'destination' }; }
  resume() { return { catch() {} }; }
  close() { return { catch() {} }; }
  createOscillator() {
    audioStats.oscillators += 1;
    return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
  }
  createGain() {
    audioStats.gains += 1;
    const params = {
      value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {},
      linearRampToValueAtTime() {}, cancelScheduledValues() {},
    };
    return { gain: params, connect() {}, disconnect() {} };
  }
}

// --- the DOM shim -------------------------------------------------------------
const canvasListeners = {};
const canvas = {
  width: 960, height: 600,
  getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 600 }; },
  getContext(kind) { return kind === '2d' ? makeCtx() : null; },
  addEventListener(type, fn) { (canvasListeners[type] ||= []).push(fn); },
  removeEventListener() {},
};

const storage = new Map();
const winListeners = {};
globalThis.document = {
  getElementById(id) { return id === 'game' ? canvas : null; },
  addEventListener() {}, removeEventListener() {}, hidden: false,
};
globalThis.window = {
  innerWidth: 1024, innerHeight: 768,
  AudioContext: FakeAudioContext,
  webkitAudioContext: undefined,
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); },
  removeEventListener() {},
};

const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.cancelAnimationFrame = () => {};
const rejections = [];
process.on('unhandledRejection', (e) => rejections.push(String(e)));

// --- import the page, then drive it -------------------------------------------
// A browser never re-enters the module; the page must boot itself after import.
await import('../src/main.js');

let now = 0;
const pump = (frames) => {
  for (let i = 0; i < frames; i++) {
    now += 16.7; // ~60 fps; each frame gets exactly one scheduled rAF generation
    const scheduled = rafQueue.length;
    for (let f = 0; f < scheduled; f++) rafQueue.shift()(now);
  }
};
const key = (k) => {
  const e = { key: k, preventDefault() {} };
  for (const fn of winListeners['keydown'] || []) fn(e);
};
const texts = () => textLog.join('\n');
const recentTexts = (n) => textLog.slice(-n).join('\n');

const checks = [];
const check = (name, ok, extra) => checks.push([ok, name, extra]);
const errored = (window_texts) =>
  /ERROR|STEP FAILED|LEVEL PROBLEM/.test(window_texts ? recentTexts(window_texts) : texts());
const clean = (name, extra) => check(name, !errored(), extra || '');

// 1. Boot: the loop must start by itself; 30 frames later the title is on
//    screen. (Before the boot fix this harness drew nothing: 0 ops forever.)
pump(30);
drawLog.splice(0, drawLog.length); textLog.splice(0, textLog.length);
pump(2);
check('the render loop boots when the page loads', drawLog.length > 0, 'opss drawn by the last frames');
check('the title screen painted its own copy', texts().includes('QUORUM RUN'), 'after the boot pump');

// 2. Attract demo animates behind the title while nothing is selected.
const ops0 = drawLog.length;
pump(120);
check('the attract demo animated behind the title', drawLog.length > ops0 * 2, `${ops0} -> ${drawLog.length} ops`);

const seenContact = audioStats.contexts;

// 3. Campaign: Enter on item 0 starts a run; it steps on its own for seconds.
key('Enter');
pump(150);
clean('Enter started a campaign run and it ticked', 'campaign');
check('the game screen replaced the title menu', !recentTexts(80).includes('QUORUM RUN'), 'last frames have no title overlay');
key('p'); pump(30); key('p'); pump(60);
key('p'); pump(20); key('p'); pump(20); // pause, resume, pause, resume
clean('P pauses and resumes repeatedly', 'pause x4');
const beforeMoves = drawLog.length;
for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd']) key(k);
pump(120);
check('movement keys survived 120 more frames', !errored(400) && drawLog.length > beforeMoves, 'arrows + wasd');

// 4. Exit the run: Escape pauses first, a second Escape abandons to the title.
key('Escape'); pump(10); key('Escape'); pump(10);
clean('leaving a run is clean', 'escape x2');
check('the title drew again after leaving', recentTexts(120).includes('QUORUM RUN'), 'title back');

// 5. Daily run (§19): a generated level must be playable without problems.
const sel = ''; // selection is tracked implicitly across screens, comments document it
key('ArrowDown'); key('Enter'); // selection 1 = Daily run
pump(200);
clean('the daily run generated and stepped cleanly', 'daily');
key('Escape'); pump(10); key('Escape'); pump(10); // back to the title (selection now 1)

// 6. Audio (§13, §24): a gesture built a context and fired cues; music
//    scheduling stays bounded rather than scheduling forever.
check('a gesture created the audio context and cues played', audioStats.contexts >= 1 && audioStats.oscillators >= 1,
  `${audioStats.contexts} contexts, ${audioStats.oscillators} oscillators, ${audioStats.gains} gains`);
check('the audio scheduler stayed bounded', audioStats.oscillators < 20000, `${audioStats.oscillators} oscillators`);

// 7. Help (§14): two downs from selection 1 lands on How to play.
key('ArrowDown'); key('ArrowDown'); key('Enter'); pump(10);
check('the help screen painted from the menu', recentTexts(60).includes('HOW TO PLAY'), 'help open');
key('Escape'); pump(5); // back to title, selection still 3

// 8. Editor (§20): up from help lands on Level editor; paint and abort.
key('ArrowUp'); key('Enter'); pump(10);
check('the editor screen painted its hint bar', recentTexts(60).includes('BRUSH'), 'editor open');
for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', ' ', 'ArrowLeft']) key(k);
key('1'); key(' '); // switch to the wall brush and paint
key('Escape'); pump(10); // abandon back to the title (selection 2)
clean('editor painting and aborting are clean', 'editor');

// 9. Sound toggle M persists valid settings JSON (§17).
key('m'); key('m'); pump(5);
const saved = storage.get('quorum-run:settings');
check('M persisted settings JSON', (() => {
  try { return JSON.parse(saved || '{}').sound === true; } catch { return false; }
})(), saved || 'nothing saved');

// 10. Long unattended soak over the title (and any screens left open).
pump(700);
clean('a long soak stayed healthy', 'title soak');

for (const [ok, name, extra] of checks) console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra ? '  (' + extra + ')' : ''));
console.log(`simulated ${Math.round(now)}ms; ${drawLog.length} draw ops; ${textLog.length} texts; ` +
  `${audioStats.contexts} audio contexts; ${audioStats.oscillators} oscillators scheduled`);
console.log(rejections.length ? 'UNHANDLED REJECTIONS: ' + rejections.join(' | ') : 'no unhandled rejections');
process.exit(checks.every((c) => c[0]) && rejections.length === 0 ? 0 : 1);
