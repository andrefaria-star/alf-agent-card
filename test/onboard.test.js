// onboard.js contract tests - deterministic, fixture-based (no HTTP races).
const { test } = require('node:test');
const { spawnSync } = require('child_process');
const path = require('path');
const fx = (f) => path.join(__dirname, 'fixtures', f);
const run = (...a) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'onboard.js'), ...a],
    { encoding: 'utf8', timeout: 10000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

test('happy path: identity verified -> conformance -> SAFE TO PROCEED with instructions', () => {
  const r = run(fx('good-card.json'));
  if (r.code !== 0) throw new Error(`expected exit 0, got ${r.code}\n${r.out}`);
  if (!r.out.includes('SAFE TO PROCEED')) throw new Error(`missing verdict:\n${r.out}`);
  if (!r.out.includes('250')) throw new Error(`missing price line:\n${r.out}`);
});

test('bad identity (empty description) -> CANNOT VERIFY, exit 1', () => {
  const r = run(fx('bad-card.json'));
  if (r.code !== 1) throw new Error(`expected exit 1, got ${r.code}`);
  if (!r.out.includes('CANNOT VERIFY')) throw new Error(r.out);
});

test('dead catalog URL -> CANNOT VERIFY, exit 1', () => {
  const r = run('http://127.0.0.1:9/card.json');
  if (r.code !== 1 || !r.out.includes('CANNOT VERIFY')) throw new Error(r.out);
});

test('catalog seller != card wallet -> conformance failure, exit 1', () => {
  const r = run(fx('mismatch-card.json'));
  if (r.code !== 1) throw new Error(`expected exit 1, got ${r.code}\n${r.out}`);
  if (!/seller .*!=.*wallet|conformance failed/i.test(r.out)) throw new Error(r.out);
});
