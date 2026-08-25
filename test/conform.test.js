// conform.js contract tests - deterministic, fixture-based.
const { test } = require('node:test');
const { spawnSync } = require('child_process');
const path = require('path');
const fx = (f) => path.join(__dirname, 'fixtures', f);
const run = (...a) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'conform.js'), ...a],
    { encoding: 'utf8', timeout: 10000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

test('good catalog -> CONFORMANT exit 0', () => {
  const r = run(fx('good-catalog.json'));
  if (r.code !== 0 || !r.out.includes('CONFORMANT')) throw new Error(`${r.code}\n${r.out}`);
});
test('cross-check: catalog + matching card -> CONFORMANT', () => {
  const r = run(fx('good-catalog.json'), fx('good-card.json'));
  if (r.code !== 0) throw new Error(r.out);
});
test('empty items[] -> NON-CONFORMANT exit 1', () => {
  const r = run(fx('empty-catalog.json'));
  if (r.code !== 1 || !/NON-CONFORMANT/.test(r.out)) throw new Error(r.out);
});
test('missing price -> NON-CONFORMANT exit 1', () => {
  const r = run(fx('noprice-catalog.json'));
  if (r.code !== 1 || !/usable price/.test(r.out)) throw new Error(r.out);
});
test('multiple violations reported together (scheme+seller+duplicate)', () => {
  const r = run(fx('multi-bad-catalog.json'));
  if (r.code !== 1) throw new Error(r.out);
  for (const frag of ['paymentScheme', 'seller', 'duplicate'])
    if (!r.out.includes(frag)) throw new Error(`missing "${frag}":\n${r.out}`);
});
test('unreachable catalog -> NON-CONFORMANT exit 1', () => {
  const r = run('http://127.0.0.1:9/catalog.json');
  if (r.code !== 1) throw new Error(r.out);
});
