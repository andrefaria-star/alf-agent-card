#!/usr/bin/env node
'use strict';
/* AGENT ON-RAMP - the single command an arriving agent runs before paying Alf.
 *   node onboard.js [cardPathOrUrl] [gatewayBase]
 * Steps: verify card -> probe /v1/catalog -> print exact payment instructions.
 * Exit 0 = safe to proceed. 1 = do NOT pay this agent. 2 = usage/unreachable. */
const fs = require('fs');
const { CHECKS } = require('./verify-agent-card.js');

function loadCard(src) {
  if (/^https?:\/\//.test(src))
    return fetch(src, { signal: AbortSignal.timeout(8000) })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  return Promise.resolve(JSON.parse(fs.readFileSync(src, 'utf8')));
}
async function probeCatalog(base) {
  const r = await fetch(base.replace(/\/$/, '') + '/v1/catalog', { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const c = await r.json();
  // REAL contract (captured from live gateway): {service,seller,chain,currency,resources[],audit,identityCard}
  const problems = [];
  if (!/^0x[0-9a-fA-F]{40}$/.test(c.seller || '')) problems.push('seller missing/not an address');
  if ((c.currency || '') !== 'USDC') problems.push('currency != USDC');
  if (!Array.isArray(c.resources) || c.resources.length === 0) problems.push('resources empty');
  else c.resources.forEach(x => {
    if (!x.id) problems.push('resource without id');
    const priced = typeof x.priceCents === 'number' && x.priceCents > 0;
    // an explicitly free-preview item is legitimate; anything else must be priced
    if (!priced && !x.freePreview) problems.push('resource ' + x.id + ' unpriced');
  });
  if (c.identityCard && !String(c.identityCard).includes('.well-known/agent-card.json'))
    problems.push('identityCard points elsewhere');
  return { ok: problems.length === 0,
           detail: problems.length ? problems.join('; ')
             : c.resources.length + ' priced item(s), seller ' + c.seller.slice(0, 10) + '...', catalog: c };
}
function paymentInstructions(card, gwBase) {
  const w = card.wallet;
  const receipts = gwBase
    ? String(card.trustSurfaces.receipts).replace(/<gateway>/g, gwBase.replace(/\/$/, ''))
    : String(card.trustSurfaces.receipts);
  return card.services.map(s =>
    `- ${s.id}: pay ${(s.priceCents / 100).toFixed(2)} USDC -> ${w.address} (chain: ${w.chain}); ` +
    `verify at ${receipts}`);
}
if (require.main === module) {
  (async () => {
    const src = process.argv[2] || '.well-known/agent-card.json';
    const gw = process.argv[3];
    let card;
    try { card = await loadCard(src); }
    catch (e) { console.error('unreadable card: ' + e.message); process.exit(2); }

    console.log('== STEP 1: identity ==');
    const fails = CHECKS.map(k => ({ n: k.name, f: k.fn(card) })).filter(x => x.f);
    fails.forEach(f => console.log('FAIL ' + f.n + ' - ' + f.f));
    console.log(`card checks: ${CHECKS.length - fails.length}/${CHECKS.length} passed`);
    if (fails.length) { console.log('VERDICT: DO NOT PAY'); process.exit(1); }

    if (gw) {
      console.log('== STEP 2: live conformance (' + gw + ') ==');
      try {
        const p = await probeCatalog(gw);
        console.log((p.ok ? 'PASS catalog: ' : 'FAIL catalog: ') + p.detail);
        if (!p.ok) { console.log('VERDICT: DO NOT PAY'); process.exit(1); }
      } catch (e) { console.log('FAIL unreachable: ' + e.message); process.exit(2); }
    } else {
      console.log('== STEP 2: skipped (no gateway base given) ==');
    }

    console.log('== STEP 3: payment instructions ==');
    paymentInstructions(card, gw).forEach(l => console.log(l));
    console.log('VERDICT: SAFE TO PROCEED');
    process.exit(0);
  })();
}
module.exports = { probeCatalog, paymentInstructions };
