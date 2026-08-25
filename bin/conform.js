#!/usr/bin/env node
'use strict';
// conform.js <catalogUrl|filePath> [cardUrl|filePath] [--json]
// SELLER-side tool: prove your own catalog conforms to x402.catalog/v1 BEFORE publishing.
// Exit 0 = CONFORMANT (safe to publish), 1 = NON-CONFORMANT. Buyer-side twin: onboard.js.
const fs = require('fs');

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const pos = args.filter((a) => !a.startsWith('--'));
const out = (o) => console.log(jsonOut ? JSON.stringify(o, null, 2) : o.text || JSON.stringify(o));
const die = (reasons) => { out({ verdict: 'NON-CONFORMANT', problems: reasons }); process.exit(1); };

async function loadJson(loc) {
  if (/^https?:\/\//.test(loc)) {
    const r = await fetch(loc, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  return JSON.parse(fs.readFileSync(loc.startsWith('file://') ? loc.slice(7) : loc, 'utf8'));
}

async function main() {
  const [catLoc, cardLoc] = pos;
  if (!catLoc) die(['usage: conform.js <catalogUrl|filePath> [cardUrl|filePath] [--json]']);
  let cat;
  try { cat = await loadJson(catLoc); }
  catch (e) { return die([`cannot load catalog: ${e.message}`]); }

  const p = [];
  if (!cat || typeof cat !== 'object') p.push('catalog is not an object');
  const items = cat && (cat.items || cat.resources);
  if (!Array.isArray(items)) p.push('missing items[] (or resources[])');
  else if (items.length === 0) p.push('items[] is empty');
  else {
    const seen = new Set();
    items.forEach((it, i) => {
      if (!it.id && !it.title) p.push(`item[${i}]: lacks id/title`);
      else {
        const key = String(it.id || it.title);
        if (seen.has(key)) p.push(`item[${i}]: duplicate id "${key}"`);
        seen.add(key);
      }
      const cents = it.priceCents != null ? Number(it.priceCents)
        : it.price != null ? Math.round(Number(it.price) * 100) : NaN;
      if (!(cents >= 0)) p.push(`item[${i}]: lacks usable price (priceCents canonical, or price in USD)`);
      else if (cents !== Math.round(cents)) p.push(`item[${i}]: fractional cents are not payable`);
      if (it.description != null && typeof it.description !== 'string') p.push(`item[${i}]: description must be string`);
    });
  }
  if (cat.paymentScheme && cat.paymentScheme !== 'exact') p.push(`unsupported paymentScheme "${cat.paymentScheme}" (only "exact")`);
  if (cat.seller && !/^0x[0-9a-fA-F]{40}$/.test(cat.seller)) p.push('seller is not a well-formed EVM address');

  // optional cross-check against the seller's own agent card
  if (cardLoc) {
    try {
      const card = await loadJson(cardLoc);
      const addr = card && card.wallet && card.wallet.address;
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr || '')) p.push('card.wallet.address missing/malformed');
      else if (cat.seller && cat.seller.toLowerCase() !== addr.toLowerCase())
        p.push(`catalog seller ${cat.seller} != card wallet ${addr}`);
      if (card && card.catalogUrl) {
        const norm = (u) => String(u).replace(/^file:\/\//, '').replace(/\/+$/, '');
        if (norm(card.catalogUrl) !== norm(catLoc))
          p.push(`card.catalogUrl points elsewhere (${card.catalogUrl})`);
      }
    } catch (e) { p.push(`cannot load card: ${e.message}`); }
  }

  if (p.length) return die(p);
  out({ verdict: 'CONFORMANT', text:
    `VERDICT: CONFORMANT\nitems checked: ${items.length}\nsafe to publish.` +
    (cardLoc ? '\ncross-checked against agent card.' : '') });
}
main().catch((e) => die([e.message]));
