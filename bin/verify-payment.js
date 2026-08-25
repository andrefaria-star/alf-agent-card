#!/usr/bin/env node
'use strict';
// verify-payment.js <txHash> --to <payeeAddress> --cents <amount> [--rpc <url>|--fixtures <file>] [--min-confirms N]
// BUYER-side post-payment proof: confirms the tx paid ENOUGH USDC to THE RIGHT payee
// with ENOUGH confirmations - before you reveal anything or ask for delivery.
// Exit 0 = PAYMENT VERIFIED, 1 = NOT VERIFIED. Twins: onboard.js (before), seller settles (after).
// --fixtures file maps { "<txHash>": receipt } for deterministic offline checks/tests.
const fs = require('fs');

const args = process.argv.slice(2);
const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const txHash = args.find((a) => /^0x[0-9a-fA-F]{64}$/.test(a));
const to = get('--to'), centsReq = Number(get('--cents'));
const rpcUrl = get('--rpc'), fixFile = get('--fixtures');
const minConfirms = Number(get('--min-confirms') || 1);
const die = (reasons) => {
  const list = [].concat(reasons);
  console.log('VERDICT: NOT VERIFIED'); list.forEach((r) => console.log(`  - ${r}`));
  process.exit(1);
};

async function main() {
  const probs = [];
  if (!txHash) probs.push('missing/malformed txHash (positional arg)');
  if (!/^0x[0-9a-fA-F]{40}$/.test(to || '')) probs.push('--to must be a well-formed EVM address');
  if (!(centsReq >= 0)) probs.push('--cents must be >= 0');
  if (!rpcUrl && !fixFile) probs.push('need --rpc <url> or --fixtures <file>');
  if (probs.length) return die(probs);

  let receipt, headHex;
  if (fixFile) {
    const fx = JSON.parse(fs.readFileSync(fixFile.startsWith('file://') ? fixFile.slice(7) : fixFile, 'utf8'));
    receipt = fx[txHash] || null;
    headHex = fx._head || '0x65';
  } else {
    const call = async (method, params) => {
      const r = await fetch(rpcUrl, { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(`RPC ${j.error.message}`);
      return j.result;
    };
    try {
      [receipt, headHex] = await Promise.all([
        call('eth_getTransactionReceipt', [txHash]),
        call('eth_blockNumber', []),
      ]);
    } catch (e) { return die(`RPC unreachable: ${e.message}`); }
  }

  if (!receipt) return die('transaction not found (wrong chain? not yet mined?)');
  if (receipt.status !== '0x1') return die(`transaction reverted (status ${receipt.status})`);
  if ((receipt.to || '').toLowerCase() !== to.toLowerCase())
    return die(`paid wrong recipient: ${receipt.to} != expected ${to}`);

  // USDC: 6 decimals. value hex (base units) -> cents = value / 1e4
  let centsPaid = NaN, confirms = NaN;
  try {
    centsPaid = Number(BigInt(receipt.value) / 10000n);
    confirms = Number(BigInt(headHex) - BigInt(receipt.blockNumber));
  } catch { return die('receipt lacks numeric value/blockNumber'); }
  if (centsPaid < centsReq) return die(`underpaid: ${centsPaid}c sent, ${centsReq}c required`);
  if (confirms < minConfirms)
    return die(`only ${confirms} confirmation(s), need ${minConfirms} (reorg risk)`);

  console.log('VERDICT: PAYMENT VERIFIED');
  console.log(`  paid: ${centsPaid}c to ${receipt.to}`);
  console.log(`  confirmations: ${confirms}`);
}
main().catch((e) => die(e.message));
