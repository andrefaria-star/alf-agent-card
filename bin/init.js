#!/usr/bin/env node
'use strict';
// init.js <outputDir> [--wallet 0x..] [--name ".."] [--price-cents N]
// SELLER onboarding: generates a CONFORMING agent-card.json + catalog.json pair,
// self-checked with conform.js BEFORE reporting success. Refuses to overwrite anything.
// Exit 0 = scaffold created AND proven conformant. Buyer twin: onboard.js.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const dirArg = args.find((a) => !a.startsWith('--'));
const wallet = get('--wallet') || '';
const name = get('--name') || 'My Agent Store';
const priceCents = Number(get('--price-cents') || 250);

const die = (m) => { console.log(`INIT FAILED: ${m}`); process.exit(1); };
if (!dirArg) die('usage: init.js <outputDir> --wallet 0xYourAddress [--name ".."] [--price-cents N]');
if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) die('--wallet must be a well-formed EVM address (0x + 40 hex)');
if (!(priceCents >= 0)) die('--price-cents must be >= 0');

const dir = path.resolve(dirArg);
fs.mkdirSync(dir, { recursive: true });
for (const f of ['agent-card.json', 'catalog.json'])
  if (fs.existsSync(path.join(dir, f))) die(`refusing to overwrite existing ${f}`);

const card = {
  schema: 'x402.agent-card/v1',
  name,
  description: 'Replace this one-line pitch: what you sell and why an agent should care.',
  wallet: { address: wallet },
  catalogUrl: 'file://' + path.join(dir, 'catalog.json'),
};
const catalog = {
  schema: 'x402.catalog/v1',
  paymentScheme: 'exact',
  seller: wallet,
  items: [{
    id: 'starter-item',
    title: 'Starter item',
    description: 'Replace with your real offering.',
    priceCents,
  }],
};
fs.writeFileSync(path.join(dir, 'agent-card.json'), JSON.stringify(card, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');

// self-proof: the scaffold MUST conform before we claim success
const chk = spawnSync(process.execPath,
  [path.join(__dirname, 'conform.js'), path.join(dir, 'catalog.json'), path.join(dir, 'agent-card.json')],
  { encoding: 'utf8' });
if (chk.status !== 0) {
  console.log(chk.stdout || chk.stderr);
  console.log('INIT FAILED: generated scaffold did not conform (files removed)');
  for (const f of ['agent-card.json', 'catalog.json'])
    try { fs.unlinkSync(path.join(dir, f)); } catch {}
  process.exit(1);
}
console.log('SCAFFOLD CREATED (self-checked CONFORMANT):');
console.log(`  ${dir}/agent-card.json`);
console.log(`  ${dir}/catalog.json`);
console.log('\nNEXT STEPS:');
console.log('  1. Edit both files - real name, pitch, and items.');
console.log('  2. Re-check before publishing:  npx x402-trust-kit conform catalog.json agent-card.json');
console.log('  3. Publish somewhere agents can fetch (https).');
console.log(`  4. See what buyers see:          npx x402-trust-kit onboard ${card.catalogUrl}`);
