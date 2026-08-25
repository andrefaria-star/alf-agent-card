const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');
test('offline demo: all steps verified', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'demo.js')],
    { encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const v of ['CONFORMANT', 'SAFE TO PROCEED', 'PAYMENT VERIFIED', 'ALL STEPS VERIFIED'])
    assert.ok(r.stdout.includes(v), `missing "${v}"`);
});
