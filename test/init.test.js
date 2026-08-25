// init.js contract tests - temp-dir isolated, fully deterministic.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const BIN = path.join(__dirname, '..', 'bin');
const W = '0x' + 'c'.repeat(40);
const run = (...a) => spawnSync(process.execPath, [path.join(BIN, 'init.js'), ...a],
  { encoding: 'utf8', timeout: 10000 });

test('happy: scaffold created, self-conformant, and buyer-onboardable', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-init-'));
  const r = run(d, '--wallet', W, '--name', 'Test Seller');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const card = JSON.parse(fs.readFileSync(path.join(d, 'agent-card.json'), 'utf8'));
  assert.equal(card.wallet.address, W);
  // the whole point: a stranger must be able to onboard onto the scaffold immediately
  const ob = spawnSync(process.execPath, [path.join(BIN, 'onboard.js'),
    'file://' + path.join(d, 'agent-card.json')], { encoding: 'utf8', timeout: 10000 });
  assert.equal(ob.status, 0, ob.stdout);
  assert.ok(ob.stdout.includes('SAFE TO PROCEED'), ob.stdout);
});

test('no-clobber: refuses when files exist', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-init-'));
  run(d, '--wallet', W);
  const r2 = run(d, '--wallet', W);
  assert.equal(r2.status, 1);
  assert.ok(/overwrite/.test(r2.stdout), r2.stdout);
});

test('malformed wallet rejected before writing anything', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-init-'));
  const r = run(d, '--wallet', '0x123');
  assert.equal(r.status, 1);
  assert.ok(!fs.existsSync(path.join(d, 'agent-card.json')));
});
