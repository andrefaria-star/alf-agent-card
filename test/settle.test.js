// settle-server contract tests - server runs OUT-OF-PROCESS (child prints PORT=n),
// parent speaks plain HTTP; every case bounded, deterministic via --fixtures.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const BIN = path.join(__dirname, '..', 'bin', 'settle-server.js');
const W = '0x' + 'c'.repeat(40), TX = '0x' + 'b'.repeat(64);

async function startServer(extraArgs = [], receiptsFile = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-settle-'));
  const secretFile = path.join(dir, 'secret.txt');
  fs.writeFileSync(secretFile, 'the-answer-is-42\n');
  const rec = receiptsFile || path.join(dir, 'receipts.jsonl');
  const fxSrc = path.join(__dirname, 'fixtures', 'pay-good.json');
  const child = spawn(process.execPath, [BIN, '--port', '0', '--pay-to', W,
    '--price-cents', '250', '--secret-file', secretFile, '--fixtures', fxSrc,
    '--receipts', rec, ...extraArgs], { stdio: ['ignore', 'pipe', 'pipe'] });
  const port = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server boot >5s')), 5000);
    child.stdout.on('data', (d) => { const m = String(d).match(/PORT=(\d+)/); if (m) { clearTimeout(t); resolve(Number(m[1])); } });
    child.once('exit', (c) => reject(new Error(`server exited early rc=${c}`)));
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 20; i++) {
    try { if ((await (await fetch(`${base}/health`)).json()).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return { child, base, close: () => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 800); } };
}
const settle = (base, tx) =>
  fetch(`${base}/v1/settle`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ txHash: tx }), signal: AbortSignal.timeout(5000) });

test('honest payment -> 200 + secret; replay -> 409', async () => {
  const s = await startServer();
  try {
    const r1 = await settle(s.base, TX);
    assert.equal(r1.status, 200, `first settle ${r1.status}`);
    const j1 = await r1.json();
    assert.equal(j1.paid, 250, 'server must report exact cents (fixture = 250c)');
    assert.equal(j1.secret, 'the-answer-is-42');
    const r2 = await settle(s.base, TX);
    assert.equal(r2.status, 409, `replay ${r2.status}`);
  } finally { s.close(); }
});

test('wrong recipient fixture -> 402, not settled', async () => {
  // point server at a catalog whose payee mismatches by using different wallet arg
  const s = await startServer(['--pay-to', '0x' + 'd'.repeat(40)]);
  try {
    const r = await settle(s.base, TX);   // fixture pays to c*40, server wants d*40
    assert.equal(r.status, 402);
    assert.ok(/recipient/.test((await r.json()).error));
  } finally { s.close(); }
});

test('underpaid impossible-by-construction guard: price raise rejects', async () => {
  const s = await startServer(['--price-cents', '999']);
  try {
    const r = await settle(s.base, TX);
    assert.equal(r.status, 402);
    assert.ok(/underpaid/.test((await r.json()).error));
  } finally { s.close(); }
});

test('receipts jsonl persists settled tx across restart (dedupe survives reboot)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-settle-r-'));
  const rec = path.join(dir, 'receipts.jsonl');
  const s1 = await startServer([], rec);
  await settle(s1.base, TX); s1.close();
  const s2 = await startServer([], rec);
  try {
    const r = await settle(s2.base, TX);
    assert.equal(r.status, 409, 'replay after restart must still be rejected');
  } finally { s2.close(); }
});

test('malformed body -> 400', async () => {
  const s = await startServer();
  try {
    const r = await fetch(`${s.base}/v1/settle`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: 'not-json',
      signal: AbortSignal.timeout(5000) });
    assert.equal(r.status, 400);
  } finally { s.close(); }
});
