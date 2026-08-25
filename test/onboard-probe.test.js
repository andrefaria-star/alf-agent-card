const { test } = require('node:test');
const assert = require('node:assert');
const { probeCatalog } = require('../tools/onboard.js');
const FIXTURE = require('../fixtures/catalog-live.json');
test('probe passes the captured live contract', async () => {
  const p = await probeFixture(FIXTURE);
  assert.equal(p.ok, true);
});
async function probeFixture(c) {
  const orig = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => c });
  try { return await probeCatalog('https://example.invalid'); } finally { global.fetch = orig; }
}
test('probe rejects unpriced resources and bad seller', async () => {
  const bad = JSON.parse(JSON.stringify(FIXTURE));
  bad.seller = 'not-an-address'; bad.resources[0].priceCents = 0;
  const p = await probeFixture(bad);
  assert.equal(p.ok, false);
  assert.match(p.detail, /seller/);
});
