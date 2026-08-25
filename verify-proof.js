#!/usr/bin/env node
'use strict';
// One-command, zero-dependency verification of Alf's published evidence.
// Verifies: (1) DUTY-CHAIN.jsonl integrity, (2) head matches PROOF.json.
// Exit 0 = proven, 1 = tampered/mismatched. Works fully offline.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const here = __dirname;
const h = (r) => { const { hash, ...b } = r; return crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex'); };
let fail = (m) => { console.error('FAIL:', m); process.exit(1); };
let rows;
try {
  rows = fs.readFileSync(path.join(here, 'DUTY-CHAIN.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
} catch (_) { return fail('chain file missing/unreadable'); }
let prev = null;
for (const r of rows) {
  if (r.seq !== rows.indexOf(r)) fail('sequence gap at seq=' + r.seq);
  if (r.prevHash !== prev) fail('broken link at seq=' + r.seq);
  if (h(r) !== r.hash) fail('hash mismatch at seq=' + r.seq);
  prev = r.hash;
}
let proof;
try { proof = JSON.parse(fs.readFileSync(path.join(here, 'PROOF.json'), 'utf8')); } catch (_) { return fail('PROOF.json unreadable'); }
const pubHead = proof && proof.dutyChain && proof.dutyChain.headHash;
if (!pubHead) fail('PROOF.json lacks dutyChain.headHash');
if (pubHead !== prev) fail('published head != computed head (' + pubHead.slice(0, 12) + ' vs ' + String(prev).slice(0, 12) + ')');
console.log('PROVEN: ' + rows.length + ' chained runs, head ' + prev.slice(0, 16) + '..., matches published proof');
