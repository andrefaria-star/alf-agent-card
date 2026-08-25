#!/usr/bin/env node
'use strict';
// demo.js - OFFLINE end-to-end walkthrough of the x402 trust workflow.
// Uses ONLY bundled fixtures and temp dirs: no network, no wallet, no cost.
// Shows exactly what a buyer experiences: scaffold -> onboard -> (pay happens offscreen)
// -> verify-payment. Exit 0 = every step verified.
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const BIN = __dirname;
const FX = path.join(path.dirname(BIN), 'test', 'fixtures');
const W = '0x' + 'c'.repeat(40);                 // demo seller wallet (fixture-only)
const TX = '0x' + 'b'.repeat(64);                // demo tx hash (fixture receipt exists)
let step = 0, failed = false;
const run = (label, tool, args, expectVerdict) => {
  step++;
  console.log(`\n[${step}] ${label}`);
  console.log(`$ npx x402-trust-kit ${tool} ${args.join(' ').replace(os.tmpdir(), '/tmp')}`);
  const r = spawnSync(process.execPath, [path.join(BIN, tool), ...args],
    { encoding: 'utf8', timeout: 15000 });
  const out = (r.stdout || '') + (r.stderr || '');
  console.log(out.trim().split('\n').slice(0, 4).join('\n'));
  const ok = r.status === 0 && (!expectVerdict || out.includes(expectVerdict));
  console.log(ok ? `    => step ${step} VERIFIED` : `    => step ${step} FAILED`);
  if (!ok) failed = true;
};

console.log('x402-trust-kit DEMO - the complete trust workflow, 100% offline.');
console.log('(In real life the same commands take URLs instead of local files.)');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-demo-'));
run('Seller scaffolds a conforming store', 'init', [dir, '--wallet', W], 'CONFORMANT');
run('Buyer verifies the seller BEFORE paying', 'onboard',
  ['file://' + path.join(dir, 'agent-card.json')], 'SAFE TO PROCEED');
console.log('\n[3] Buyer sends 250 USDC-cents on Base ... (real world; here we use a fixture receipt)');
run('Buyer proves the payment landed AFTER paying', 'verify-payment',
  [TX, '--to', W, '--cents', '250', '--fixtures', path.join(FX, 'pay-good.json')], 'PAYMENT VERIFIED');

console.log('\n=== DEMO RESULT:', failed ? 'A STEP FAILED' : 'ALL STEPS VERIFIED - this is the whole product', '===');
fs.rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
