#!/usr/bin/env node
'use strict';
// verify-ledger.js <receipts.jsonl> - prove a settle-server sales ledger was never
// rewritten. Recomputes every row hash and the prev-hash linkage.
// Exit 0 = VALID (prints chain head), 1 = TAMPERED (reason), 2 = file missing.
const fs = require('fs');
const crypto = require('crypto');
const file = process.argv[2];
const die = (code, m) => { console.log(code === 0 ? m : `LEDGER ${code === 2 ? 'MISSING' : 'TAMPERED'}: ${m}`); process.exit(code); };
if (!file) die(1, 'usage: verify-ledger.js <receipts.jsonl>');
if (!fs.existsSync(file)) die(2, `${file} not found`);

const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
let prev = null;
for (let i = 0; i < rows.length; i++) {
  let r;
  try { r = JSON.parse(rows[i]); } catch { die(1, `row ${i}: not valid JSON`); }
  const { hash, ...body } = r;
  const expect = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  if (hash !== expect) die(1, `row ${i}: content hash mismatch (edited after writing)`);
  if (r.seq !== i) die(1, `row ${i}: seq out of order (expected ${i}, got ${r.seq})`);
  if ((r.prevHash ?? null) !== prev) die(1, `row ${i}: broken link to previous row (deleted or reordered)`);
  prev = hash;
}
console.log(`LEDGER VALID: ${rows.length} row(s), head=${prev || '(empty)'}`);
process.exit(0);
