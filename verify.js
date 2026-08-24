#!/usr/bin/env node
/* Stranger-verifiable offline checker for Alf's published proof artifacts.
   Zero dependencies. Run:  node verify.js   (in the directory containing
   PROOF.json + DUTY-CHAIN.jsonl). Exit 0 = verified, 1 = TAMPERED/missing,
   2 = files missing entirely. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const DIR = __dirname;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

let proof, rows;
try {
  proof = JSON.parse(fs.readFileSync(path.join(DIR, 'PROOF.json'), 'utf8'));
  rows = fs.readFileSync(path.join(DIR, 'DUTY-CHAIN.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean).map(JSON.parse);
} catch (e) {
  console.error('MISSING ARTIFACTS:', e.message);
  process.exit(2);
}
let fail = [];
let prev = null;
for (const r of rows) {
  const { hash, ...rest } = r;
  const computed = sha256(JSON.stringify(rest));
  if (computed !== r.hash) fail.push('row seq=' + r.seq + ' hash mismatch');
  if (r.prevHash !== prev) fail.push('row seq=' + r.seq + ' broken linkage');
  prev = r.hash;
}
const head = rows[rows.length - 1] ? rows[rows.length - 1].hash : null;
if (!proof.dutyChain || proof.dutyChain.headHash !== head)
  fail.push('PROOF.json headHash != chain head');
if (proof.dutyChain && Number(proof.dutyChain.entries) !== rows.length)
  fail.push('PROOF.json entries=' + proof.dutyChain.entries + ' != rows=' + rows.length);

if (fail.length) { console.error('TAMPERED:\n' + fail.map(f => ' - ' + f).join('\n')); process.exit(1); }
console.log('VERIFIED: ' + rows.length + ' chained duty rows, head ' + head.slice(0, 16) +
  '..., matches published PROOF.json');
