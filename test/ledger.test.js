// Ledger contract tests - REAL settle pipeline produces the ledger; tampering detected.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const SERVER = path.join(__dirname, '..', 'bin', 'settle-server.js');
const VLEDGER = path.join(__dirname, '..', 'bin', 'verify-ledger.js');
const W = '0x' + 'c'.repeat(40), TX = '0x' + 'b'.repeat(64);

async function startServer(rec) {
  const dir = path.dirname(rec);
  const secretFile = path.join(dir, 'secret.txt');
  fs.writeFileSync(secretFile, 's\n');
  const child = spawn(process.execPath, [SERVER, '--port', '0', '--pay-to', W,
    '--price-cents', '250', '--secret-file', secretFile,
    '--fixtures', path.join(__dirname, 'fixtures', 'pay-good.json'),
    '--receipts', rec], { stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('boot>5s')), 5000);
    child.stdout.on('data', (d) => { const m = String(d).match(/PORT=(\d+)/); if (m) { clearTimeout(t); res(Number(m[1])); } });
    child.once('exit', (c) => rej(new Error(`early exit rc=${c}`)));
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 20; i++) { try { if ((await (await fetch(`${base}/health`)).json()).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  return { child, base, close: () => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 800); } };
}
const vrun = (f) => spawnSync(process.execPath, [VLEDGER, f], { encoding: 'utf8', timeout: 10000 });

test('real settle -> ledger VALID with correct head', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-ledger-'));
  const rec = path.join(dir, 'receipts.jsonl');
  const s = await startServer(rec);
  try {
    await fetch(`${s.base}/v1/settle`, { method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txHash: TX }), signal: AbortSignal.timeout(5000) });
  } finally { s.close(); }
  const r = vrun(rec);
  assert.equal(r.status, 0, r.stdout);
  assert.ok(/VALID: 1 row/.test(r.stdout), r.stdout);
});

test('edited amount -> TAMPERED', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-ledger-t-'));
  const rec = path.join(dir, 'r.jsonl');
  fs.writeFileSync(rec, JSON.stringify({ seq: 0, ts: 't', txHash: TX, paidCents: 250, prevHash: null, hash: 'nope' }) + '\n');
  const r = vrun(rec);
  assert.equal(r.status, 1);
  assert.ok(/hash mismatch|recomputed/i.test(r.stdout) || /TAMPERED/.test(r.stdout), r.stdout);
});

test('row deletion -> TAMPERED (broken linkage)', () => {
  // two chained rows built by the SAME scheme, then delete the first
  const mk = (seq, prevHash) => {
    const body = { seq, ts: 't', txHash: '0x' + String(seq).padStart(64, '0'), paidCents: 250, prevHash };
    body.hash = require('crypto').createHash('sha256').update(JSON.stringify(body)).digest('hex');
    return JSON.stringify(body);
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-ledger-d-'));
  const good = path.join(dir, 'good.jsonl'), bad = path.join(dir, 'bad.jsonl');
  const r0 = mk(0, null), r1 = mk(1, JSON.parse(r0).hash);
  fs.writeFileSync(good, r0 + '\n' + r1 + '\n');
  fs.writeFileSync(bad, r1 + '\n');            // survivor without its parent
  assert.equal(vrun(good).status, 0);
  const r = vrun(bad);
  assert.equal(r.status, 1);
  assert.ok(/link|seq/.test(r.stdout), r.stdout);
});

test('missing file -> exit 2', () => {
  const r = vrun('/nonexistent/x.jsonl');
  assert.equal(r.status, 2);
});
