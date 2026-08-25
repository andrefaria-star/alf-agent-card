#!/usr/bin/env node
'use strict';
/* AGENT ON-RAMP - the single command an arriving agent runs before paying Alf.
 *   node onboard.js [cardPathOrUrl] [gatewayBase] [--json]
 * Steps: verify card -> probe /v1/catalog -> print exact payment instructions.
 * Exit 0 = safe to proceed. 1 = do NOT pay this agent. 2 = usage/unreachable.
 * --json: single machine-readable JSON object instead of human narrative. */
const fs = require('fs');
const { CHECKS } = require(require('path').join(__dirname, '..', 'bin', 'verify-agent-card.js'));

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
    const JSON_MODE = process.argv.includes('--json');
    const pos = process.argv.slice(2).filter(a => a !== '--json');
    const src = pos[0] || '.well-known/agent-card.json';
    const gw = pos[1];
    const checksOut = [];
    const say = s => { if (!JSON_MODE) console.log(s); };
    const emitJson = o => { if (JSON_MODE) console.log(JSON.stringify(o, null, 2)); };

    let card;
    try { card = await loadCard(src); }
    catch (e) {
      emitJson({ tool: 'onboard', verdict: 'UNREADABLE_CARD', error: String(e.message) });
      if (!JSON_MODE) console.error('unreadable card: ' + e.message);
      process.exit(2);
    }

    say('== STEP 1: identity ==');
    const fails = [];
    CHECKS.forEach(k => {
      const f = k.fn(card);
      checksOut.push({ name: k.name, pass: !f });
      if (f) fails.push({ n: k.name, f });
    });
    if (!JSON_MODE) {
      fails.forEach(f => console.log('FAIL ' + f.n + ' - ' + f.f));
      console.log(`card checks: ${CHECKS.length - fails.length}/${CHECKS.length} passed`);
    }
    const doNotPay = detail => {
      emitJson({ tool: 'onboard', verdict: 'DO NOT PAY', checks: checksOut, detail: detail || null });
      say('VERDICT: DO NOT PAY');
      process.exit(1);
    };
    if (fails.length) return doNotPay(`identity card failed ${fails.length} check(s)`);

    let conformance = null;
    if (gw) {
      say('== STEP 2: live conformance (' + gw + ') ==');
      try {
        const p = await probeCatalog(gw);
        conformance = { ok: p.ok, detail: p.detail };
        say((p.ok ? 'PASS catalog: ' : 'FAIL catalog: ') + p.detail);
        if (!p.ok) return doNotPay(p.detail);
      } catch (e) {
        emitJson({ tool: 'onboard', verdict: 'GATEWAY_UNREACHABLE', checks: checksOut, error: String(e.message) });
        say('FAIL unreachable: ' + e.message);
        process.exit(2);
      }
    } else {
      say('== STEP 2: skipped (no gateway base given) ==');
    }

    const instructions = paymentInstructions(card, gw);
    say('== STEP 3: payment instructions ==');
    instructions.forEach(l => say(l));
    emitJson({ tool: 'onboard', verdict: 'SAFE TO PROCEED', checks: checksOut, conformance, instructions });
    say('VERDICT: SAFE TO PROCEED');
    process.exit(0);
  })();
}
module.exports = { probeCatalog, paymentInstructions };
