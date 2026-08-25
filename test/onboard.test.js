const { test } = require('node:test');
const assert = require('node:assert');
const { paymentInstructions, probeCatalog } = require('../tools/onboard.js');
const CARD = require('../.well-known/agent-card.json');
const FIXTURE = require('./fixtures/catalog-live.json');

function fetchStub(body) {
  const orig = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => body });
  return async () => { global.fetch = orig; };
}

test('instructions cover every service with wallet, USDC, chain, receipts', () => {
  const lines = paymentInstructions(CARD);
  assert.equal(lines.length, CARD.services.length);
  lines.forEach(l => {
    assert.ok(l.includes(CARD.wallet.address));
    assert.ok(l.includes('USDC'));
    assert.ok(l.includes(String(CARD.wallet.chain)));
    assert.ok(l.includes('/v1/receipts'));
  });
});

test('receipts placeholder resolves when gateway base given', () => {
  const [line] = paymentInstructions(CARD, 'https://gw.example');
  assert.ok(line.includes('https://gw.example/v1/receipts'), line);
  assert.ok(!line.includes('<gateway>'));
});
test('without base, placeholder stays explicit (never silently wrong)', () => {
  assert.ok(paymentInstructions(CARD)[0].includes('<gateway>'));
});

test('price lines derive dollars-from-cents for every service', () => {
  paymentInstructions(CARD).forEach((l, i) =>
    assert.ok(l.includes((CARD.services[i].priceCents / 100).toFixed(2)), 'line ' + i));
});

test('probe accepts the captured live catalog contract', async () => {
  const done = fetchStub(FIXTURE);
  try { const p = await probeCatalog('https://x.invalid');
         assert.ok(p.ok, 'probe said: ' + p.detail); }
  finally { await done(); }
});

test('probe rejects unpriced resources and non-address seller', async () => {
  const bad = JSON.parse(JSON.stringify(FIXTURE));
  bad.seller = 'not-an-address';
  delete bad.resources[0].freePreview; bad.resources[0].priceCents = 0;
  const done = fetchStub(bad);
  try {
    const p = await probeCatalog('https://x.invalid');
    assert.equal(p.ok, false);
    assert.match(p.detail, /seller/);
    assert.match(p.detail, /unpriced/);
  } finally { await done(); }
});
