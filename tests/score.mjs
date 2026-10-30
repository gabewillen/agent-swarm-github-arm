// A node:test reporter that prints the score: tests passed out of the
// total, per spec section (test file) and overall, plus the first lines of
// each failure. `node tests/run.mjs` uses it; so do the runners.
//
//   section 05-movement: passed 9/10
//   ...
//   passed 123/236
import { basename } from 'node:path';

const MAX_FAILURES = 60;
const ROOT = `${process.cwd()}/`;

export default async function* score(source) {
  const sections = new Map();
  const failures = [];
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const d = event.data;
    if (d.nesting !== 0 || d.details?.type === 'suite') continue;
    const section = d.file ? basename(d.file).replace(/\.test\.mjs$/, '') : 'unknown';
    if (!sections.has(section)) sections.set(section, { passed: 0, total: 0 });
    const s = sections.get(section);
    s.total++;
    if (event.type === 'test:pass') s.passed++;
    else if (failures.length < MAX_FAILURES) {
      const err = d.details?.error;
      const cause = err?.cause ?? err;
      const msg = String(cause?.message ?? cause ?? 'failed').split('\n').slice(0, 3).join(' / ').replaceAll(ROOT, '');
      failures.push(`FAIL ${section}: ${d.name}: ${msg}`);
    }
  }
  for (const f of failures) yield `${f}\n`;
  let passed = 0;
  let total = 0;
  for (const name of [...sections.keys()].sort()) {
    const s = sections.get(name);
    passed += s.passed;
    total += s.total;
    yield `section ${name}: passed ${s.passed}/${s.total}\n`;
  }
  yield `passed ${passed}/${total}\n`;
}
