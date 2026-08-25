#!/usr/bin/env node
'use strict';
// settle-server.js - REFERENCE settlement endpoint for x402 sellers.
// POST /v1/settle {txHash} -> server re-verifies the payment ON ITS OWN
// (never trusts the client), appends a dedupe receipt, returns the secret.
// Replay-proof, bounded bodies, offline --fixtures mode for tests/demos.
//   x402-trust-kit settle --port 8088 --pay-to 0x.. --price-cents 250 \
//     --secret-file ./premium.json [--rpc URL|--fixtures FILE] [--receipts FILE]
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const args = process.argv.slice(2);
// LAST occurrence wins - standard override semantics, so later flags replace earlier ones.
const get = (f) => { const i = args.lastIndexOf(f); return i >= 0 ? args[i + 1] : null; };
const PORT = Number(get('--port') || 0);
const PAY_TO = get('--pay-to') || '';
const PRICE = Number(get('--price-cents') || NaN);
const SECRET_FILE = get('--secret-file');
const RPC = get('--rpc'), FIXTURES = get('--fixtures');
const RECEIPTS = get('--receipts') || null;
const MIN_CONFIRMS = Number(get('--min-confirms') || 1);
const die = (m) => { console.error(`settle-server: ${m}`); process.exit(1); };

if (!/^0x[0-9a-fA-F]{40}$/.test(PAY_TO)) die('--pay-to must be a well-formed EVM address');
if (!(PRICE >= 0)) die('--price-cents required');
if (!RPC && !FIXTURES) die('need --rpc <url> or --fixtures <file>');
let SECRET;
try {
  SECRET = SECRET_FILE ? fs.readFileSync(SECRET_FILE.startsWith('file://') ? SECRET_FILE.slice(7) : SECRET_FILE, 'utf8')
                       : 'demo-secret';
} catch (e) { die(`cannot read secret file: ${e.message}`); }

let FX = null;
if (FIXTURES) { try { FX = JSON.parse(fs.readFileSync(FIXTURES.startsWith('file://') ? FIXTURES.slice(7) : FIXTURES, 'utf8')); } catch (e) { die(e.message); } }
const seenTx = new Set();
if (RECEIPTS && fs.existsSync(RECEIPTS))
  for (const l of fs.readFileSync(RECEIPTS, 'utf8').split('\n').filter(Boolean))
    try { seenTx.add(JSON.parse(l).txHash.toLowerCase()); } catch {}

async function rpcCall(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`RPC HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

// Tamper-evident ledger: each row commits to its content AND the previous row's hash.
function record(txHash, paidCents) {
  if (!RECEIPTS) return;
  let rows = [];
  if (fs.existsSync(RECEIPTS))
    rows = fs.readFileSync(RECEIPTS, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const prev = rows.length ? rows[rows.length - 1].hash : null;
  const row = {
    seq: rows.length ? rows[rows.length - 1].seq + 1 : 0,
    ts: new Date().toISOString(),
    txHash: txHash.toLowerCase(),
    paidCents,
    prevHash: prev,
  };
  row.hash = crypto.createHash('sha256')
    .update(JSON.stringify({ seq: row.seq, ts: row.ts, txHash: row.txHash,
      paidCents: row.paidCents, prevHash: row.prevHash }))
    .digest('hex');
  fs.appendFileSync(RECEIPTS, JSON.stringify(row) + '\n');
}

const srv = http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true, priceCents: PRICE });
  if (req.method !== 'POST' || req.url !== '/v1/settle') return send(404, { error: 'not found' });
  let body = ''; let overflow = false;
  req.on('data', (c) => { body += c; if (body.length > 1e6) { overflow = true; req.destroy(); } });
  req.on('end', async () => {
    if (overflow) return;
    let tx;
    try { tx = String(JSON.parse(body).txHash || ''); } catch { return send(400, { error: 'invalid JSON' }); }
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return send(400, { error: 'malformed txHash' });
    if (seenTx.has(tx.toLowerCase())) return send(409, { error: 'already settled (replay rejected)' });
    try {
      const receipt = FX ? (FX[tx] || null) : await rpcCall('eth_getTransactionReceipt', [tx]);
      const headHex = FX ? (FX._head || '0x65') : await rpcCall('eth_blockNumber', []);
      if (!receipt) return send(402, { error: 'payment not found' });
      if (receipt.status !== '0x1') return send(402, { error: 'transaction reverted' });
      if ((receipt.to || '').toLowerCase() !== PAY_TO.toLowerCase()) return send(402, { error: 'paid wrong recipient' });
      const centsPaid = Number(BigInt(receipt.value) / 10000n);
      const confirms = Number(BigInt(headHex) - BigInt(receipt.blockNumber));
      if (centsPaid < PRICE) return send(402, { error: `underpaid: ${centsPaid}c < ${PRICE}c` });
      if (confirms < MIN_CONFIRMS) return send(402, { error: `only ${confirms} confirmation(s)` });
      seenTx.add(tx.toLowerCase()); record(tx, centsPaid);
      return send(200, { ok: true, secret: SECRET.trim(), paid: centsPaid });
    } catch (e) { return send(502, { error: `verification failed: ${e.message}` }); }
  });
});
srv.listen(PORT, '127.0.0.1', () => console.log(`PORT=${srv.address().port}`));
srv.on('error', (e) => { console.error(e.message); process.exit(1); });
process.on('SIGTERM', () => process.exit(0));
