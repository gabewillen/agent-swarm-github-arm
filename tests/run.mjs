// Runs the acceptance tests and prints the score (tests/score.mjs):
//   node tests/run.mjs            every section
//   node tests/run.mjs 05 09      only the sections whose names hold 05 or 09
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const wanted = process.argv.slice(2);
const files = readdirSync(here)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => wanted.length === 0 || wanted.some((w) => f.includes(w)))
  .sort()
  .map((f) => join('tests', f));
const r = spawnSync(process.execPath, [
  '--no-warnings', '--test', '--test-isolation=none', '--test-timeout=20000',
  '--test-reporter=./tests/score.mjs', ...files,
], { cwd: join(here, '..'), stdio: 'inherit' });
process.exit(r.status ?? 1);
