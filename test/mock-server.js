#!/usr/bin/env node
/* Standalone fixture server for onboard-json tests.
 * Owns its OWN event loop - no contention with test-parent or onboard-child.
 * Serves: /card.json (valid agent card)
 *         /v1/catalog   (good catalog)
 *         /catalog-bad  (bad catalog: currency EUR)
 * Prints PORT=<n> on stdout when ready. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const CARD = fs.readFileSync(path.join(__dirname, '..', '.well-known', 'agent-card.json'), 'utf8');
const GOOD = {
  service: 'alf-compute', chain: 'base', currency: 'USDC',
  seller: JSON.parse(CARD).wallet.address,
  resources: [{ id: 'cpu-minute', priceCents: 1 }],
  identityCard: 'https://example/.well-known/agent-card.json'
};
const BAD = Object.assign({}, GOOD, { currency: 'EUR' });
const srv = http.createServer((req, res) => {
  const body = req.url.startsWith('/catalog-bad') ? JSON.stringify(BAD)
             : req.url.includes('catalog')        ? JSON.stringify(GOOD)
             : CARD;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(body);
});
srv.listen(0, '127.0.0.1', () => console.log('PORT=' + srv.address().port));
