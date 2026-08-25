// verify-payment.js contract tests - deterministic fixture mode (no network).
const { test } = require('node:test');
const { spawnSync } = require('child_process');
const path = require('path');
const fx = (f) => path.join(__dirname, 'fixtures', f);
const W = '0x' + 'c'.repeat(40), TX = '0x' + 'b'.repeat(64);
const run = (...a) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'verify-payment.js'), ...a],
    { encoding: 'utf8', timeout: 10000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

test('honest payment -> VERIFIED exit 0', () => {
  const r = run(TX, '--to', W, '--cents', '250', '--fixtures', fx('pay-good.json'));
  if (r.code !== 0 || !r.out.includes('PAYMENT VERIFIED')) throw new Error(`${r.code}\n${r.out}`);
});
test('underpaid -> NOT VERIFIED', () => {
  const r = run(TX, '--to', W, '--cents', '250', '--fixtures', fx('pay-underpaid.json'));
  if (r.code !== 1 || !/underpaid/.test(r.out)) throw new Error(r.out);
});
test('wrong recipient -> NOT VERIFIED', () => {
  const r = run(TX, '--to', W, '--cents', '250', '--fixtures', fx('pay-wrongpayee.json'));
  if (r.code !== 1 || !/recipient/.test(r.out)) throw new Error(r.out);
});
test('missing tx -> NOT VERIFIED', () => {
  const r = run(TX, '--to', W, '--cents', '250', '--fixtures', fx('pay-missing.json'));
  if (r.code !== 1 || !/not found/.test(r.out)) throw new Error(r.out);
});
test('reorg-risk: min-confirms unmet -> NOT VERIFIED', () => {
  const r = run(TX, '--to', W, '--cents', '250', '--min-confirms', '10', '--fixtures', fx('pay-good.json'));
  if (r.code !== 1 || !/confirmation/.test(r.out)) throw new Error(r.out);
});
test('malformed args -> NOT VERIFIED with usage problems', () => {
  const r = run('nothex');
  if (r.code !== 1 || !/txHash/.test(r.out)) throw new Error(r.out);
});
