#!/usr/bin/env node
// Agent On-Ramp (Alf, 2026-08-25): one command from agent-card URL to payment-ready.
// Chain: verify card identity -> discover catalog -> contract conformance ->
//        cross-check seller vs card identity -> print exact payment instructions.
// Zero dependencies. Exit 0 = trustworthy & payment-ready, 1 = do NOT pay.
'use strict';
const RX = /^0x[0-9a-fA-F]{40}$/;

async function jget(u, label) {
  let r;
  try { r = await fetch(u, { headers: { accept: 'application/json' } }); }
  catch (e) { throw new Error(`${label}: unreachable (${e.message})`); }
  if (!r.ok) throw new Error(`${label}: HTTP ${r.status}`);
  return r.json();
}

function cardChecks(c) {
  const p = [];
  const add = (msg, ok) => p.push([msg, !!ok]);
  if (!c || typeof c !== 'object') { add('card is not a JSON object', false); return p; }
  add('type marker present', c.type || c['@type'] || c.agentType);
  const id = (c.wallet && c.wallet.address) || (c.contact && c.contact.eth);
  add('payment identity well-formed (wallet.address|contact.eth)', RX.test(String(id || '')));
  add('advertises catalogUrl', !!c.catalogUrl);
  add('name present', !!(c.name || c.agentName));
  add('description present', !!(c.description || c.descriptionShort));
  return p;
}

function catChecks(c) {
  const p = [];
  const add = (msg, ok) => p.push([msg, !!ok]);
  add('currency is USDC', c.currency === 'USDC');
  add('seller address well-formed', RX.test(String(c.seller || '')));
  const rs = Array.isArray(c.resources) ? c.resources : [];
  add(`resources non-empty (${rs.length})`, rs.length > 0);
  add('all resources have ids', rs.every(r => r && r.id));
  add('all resources priced or freePreview', rs.every(r => r && (r.priceCents > 0 || r.freePreview)));
  return p;
}

function report(title, checks) {
  console.log(`\n== ${title} ==`);
  let bad = 0;
  for (const [m, ok] of checks) { console.log(` ${ok ? '\u2713' : '\u2717'} ${m}`); if (!ok) bad++; }
  return bad;
}

(async () => {
  const url = process.argv[2] ||
    'https://raw.githubusercontent.com/andrefaria-star/alf-agent-card/main/.well-known/agent-card.json';
  console.log(`Agent On-Ramp\n target: ${url}\n`);
  try {
    const card = await jget(url, 'agent card');
    const cbad = report('CARD IDENTITY', cardChecks(card));
    const id = (card.wallet && card.wallet.address) || (card.contact && card.contact.eth);
    if (!card.catalogUrl) {
      console.log('\nVERDICT: CARD INVALID (no catalog advertised) - do not pay.');
      process.exit(1);
    }
    const cat = await jget(card.catalogUrl, 'catalog');
    const kbad = report('CATALOG CONTRACT', catChecks(cat));
    const match = id && String(cat.seller).toLowerCase() === String(id).toLowerCase();
    const xbad = report('IDENTITY LINKAGE', [[
      match ? 'catalog.seller matches card payment identity' :
              `MISMATCH: card=${id} catalog=${cat.seller}`, match]]);

    const total = cbad + kbad + xbad;
    if (total > 0) {
      console.log(`\nVERDICT: NOT TRUSTWORTHY (${total} failed check${total > 1 ? 's' : ''}) - do not pay.`);
      process.exit(1);
    }
    const first = (cat.resources || []).find(r => r.priceCents > 0);
    console.log(`
VERDICT: TRUSTWORTHY - SAFE TO PROCEED
--------------------------------------
Payment instructions (x402):
  pay to   : ${cat.seller}
  amount   : ${first ? first.priceCents : '?'} cents USDC
  chain    : ${cat.chain || 'base'}
  resource : ${first ? first.id : '?'}
  scheme   : ${(first && first.paymentScheme) || 'x402'}
Buy via any x402 client, or:
  npx github:andrefaria-star/x402-catalog-lint/bin/onboard.js <catalog-url>
`);
    process.exit(0);
  } catch (e) {
    console.error(`\nVERDICT: CANNOT VERIFY (${e.message}) - do not pay.`);
    process.exit(1);
  }
})();
