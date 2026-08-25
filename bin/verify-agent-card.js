#!/usr/bin/env node
'use strict';
/* Verify an ERC-8004-style agent card BEFORE trusting it with money.
 * Usage: node verify-agent-card.js <path-or-URL>
 * Exit 0 = valid, 1 = violations, 2 = usage/unreadable. */
const fs = require('fs');
const CHECKS = [
  { name: 'type marker', fn: c => typeof c.type === 'string' && c.type.includes('eip-8004') ? null : 'missing eip-8004 type' },
  { name: 'numeric id', fn: c => Number.isInteger(c.id) && c.id > 0 ? null : 'id must be positive integer' },
  { name: 'name present', fn: c => typeof c.name === 'string' && c.name.length > 0 ? null : 'name missing' },
  { name: 'wallet address shape', fn: c => /^0x[0-9a-fA-F]{40}$/.test((c.wallet || {}).address || '') ? null : 'wallet.address not 0x+40hex' },
  { name: 'wallet chain/currency', fn: c => c.wallet && c.wallet.chain && c.wallet.currency ? null : 'wallet.chain/currency missing' },
  { name: 'services priced', fn: c => Array.isArray(c.services) && c.services.length > 0 && c.services.every(s => Number(s.priceCents) > 0 && s.id) ? null : 'services[] missing/empty/unpriced' },
  { name: 'trust surfaces declared', fn: c => c.trustSurfaces && c.trustSurfaces.catalog && c.trustSurfaces.receipts ? null : 'trustSurfaces.catalog/receipts missing' },
];
function load(src) {
  if (/^https?:\/\//.test(src))
    return fetch(src, { signal: AbortSignal.timeout(8000) }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  return Promise.resolve(JSON.parse(fs.readFileSync(src, 'utf8')));
}
if (require.main === module) {
  const src = process.argv[2];
  if (!src) { console.error('usage: verify-agent-card.js <path-or-URL>'); process.exit(2); }
  load(src).then(c => {
    const fails = CHECKS.map(k => ({ name: k.name, fail: k.fn(c) })).filter(x => x.fail);
    fails.forEach(f => console.log('FAIL ' + f.name + ' - ' + f.fail));
    CHECKS.length - fails.length > 0 && console.log('PASS ' + (CHECKS.length - fails.length) + '/' + CHECKS.length + ' checks');
    console.log(fails.length === 0 ? 'VERDICT: card valid' : 'VERDICT: do not trust this card');
    process.exit(fails.length ? 1 : 0);
  }).catch(e => { console.error('unreadable: ' + e.message); process.exit(2); });
}
module.exports = { CHECKS };
