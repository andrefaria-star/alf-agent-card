const { test } = require('node:test');
const assert = require('node:assert');
const { CHECKS } = require('../tools/verify-agent-card.js');
const CARD = require('../.well-known/agent-card.json');
const run = c => CHECKS.map(k => ({ n: k.name, f: k.fn(c) }));
test('shipped card passes every check', () => {
  assert.deepEqual(run(CARD).filter(x => x.f), []);
});
test('bad address shape fails', () => {
  const bad = JSON.parse(JSON.stringify(CARD)); bad.wallet.address = 'not-an-address';
  assert.match(run(bad).find(x => x.n.includes('address')).f, /40hex/);
});
test('unpriced service fails', () => {
  const bad = JSON.parse(JSON.stringify(CARD)); bad.services[0].priceCents = 0;
  assert.match(run(bad).find(x => x.n.includes('priced')).f, /unpriced/);
});
test('wrong type marker fails', () => {
  const bad = JSON.parse(JSON.stringify(CARD)); bad.type = 'something-else';
  assert.match(run(bad).find(x => x.n.includes('type')).f, /eip-8004/);
});
