#!/usr/bin/env node
'use strict';
// onboard.js <cardUrl|filePath> [--json]
// Agent on-ramp: one command that chains identity verification -> catalog
// conformance -> payment instructions. Exit 0 = SAFE TO PROCEED, 1 = CANNOT VERIFY.
// Accepts https(s) URLs (5s hard cap) or local file paths (deterministic testing).
// Tolerant of both published catalog shapes: {items:[...]} and {resources:[...]};
// prices accepted as priceCents (canonical) or price (per black-box lessons).
const fs = require('fs');

const arg = process.argv[2];
const jsonOut = process.argv.includes('--json');
const out = (o) => console.log(jsonOut ? JSON.stringify(o, null, 2) : o.text || JSON.stringify(o));
const die = (reason) => { out({ verdict: 'CANNOT VERIFY', reason }); process.exit(1); };

if (!arg) die('usage: onboard.js <cardUrl|filePath> [--json]');

function loadJson(loc) {
  if (/^https?:\/\//.test(loc)) {
    // synchronous fetch via child is overkill; use bounded async at top level instead
    return null; // handled by main()
  }
  try { return Promise.resolve(JSON.parse(fs.readFileSync(loc, 'utf8'))); }
  catch (e) { return Promise.reject(new Error(`cannot read ${loc}: ${e.message}`)); }
}

async function main() {
  let card;
  if (/^https?:\/\//.test(arg)) {
    try {
      const r = await fetch(arg, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      card = await r.json();
    } catch (e) { return die(`card unreachable: ${e.message}`); }
  } else {
    try { card = JSON.parse(fs.readFileSync(arg.replace(/^file:\/\//, ''), 'utf8')); }
    catch (e) { return die(`cannot read ${arg}: ${e.message}`); }
  }

  const problems = [];
  // --- identity verification ---
  if (!card || typeof card !== 'object') problems.push('card is not an object');
  if (!card.name || typeof card.name !== 'string') problems.push('missing name');
  if (!card.description || typeof card.description !== 'string') problems.push('missing description');
  const addr = card.wallet && card.wallet.address;
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr || '')) problems.push('wallet.address missing/malformed');
  if (problems.length) return die(`identity failed: ${problems.join('; ')}`);

  // --- catalog conformance ---
  let cat = null;
  if (card.catalogUrl) {
    try {
      if (/^https?:\/\//.test(card.catalogUrl)) {
        const r2 = await fetch(card.catalogUrl, { signal: AbortSignal.timeout(5000) });
        if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
        cat = await r2.json();
      } else {
        cat = JSON.parse(fs.readFileSync(card.catalogUrl.startsWith('file://') ? card.catalogUrl.slice(7) : card.catalogUrl, 'utf8'));
      }
    } catch (e) { return die(`catalog unreachable: ${e.message}`); }
  }
  const items = (cat && (cat.items || cat.resources)) || [];
  if (!Array.isArray(items) || items.length === 0) problems.push('catalog has no items/resources');
  else {
    items.forEach((it, i) => {
      if (!it.id && !it.title) problems.push(`item[${i}] lacks id/title`);
      const cents = it.priceCents != null ? Number(it.priceCents)
        : it.price != null ? Math.round(Number(it.price) * 100) : NaN;
      if (!(cents >= 0)) problems.push(`item[${i}] lacks usable price`);
    });
  }
  const sellerMismatch = cat && cat.seller && addr && cat.seller.toLowerCase() !== addr.toLowerCase();
  if (sellerMismatch) problems.push(`catalog seller ${cat.seller} != card wallet ${addr}`);
  if (problems.length) return die(`conformance failed: ${problems.join('; ')}`);

  // --- payment instructions (cheapest item) ---
  const priced = items.map((it) => ({
    id: it.id || it.title,
    cents: it.priceCents != null ? Number(it.priceCents) : Math.round(Number(it.price) * 100),
  })).sort((a, b) => a.cents - b.cents);
  const first = priced[0];
  const lines = [
    'VERDICT: SAFE TO PROCEED',
    `seller: ${card.name} (${addr})`,
    ...priced.map((p) => `  - ${p.id}: ${p.cents} cents`),
    '',
    'PAYMENT INSTRUCTIONS:',
    `1. Send >= ${first.cents} cents of USDC (Base, 6 decimals) to ${addr}`,
    '2. Record your transaction hash',
    `3. Follow the seller's settlement endpoint with {"txHash":"0x..."}`,
    '   (see the seller catalog/advertisement for the exact endpoint)',
  ];
  out({ verdict: 'SAFE TO PROCEED', seller: addr, name: card.name,
    offerings: priced, text: lines.join('\n') });
}
main().catch((e) => die(e.message));
