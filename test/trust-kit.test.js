const { test } = require('node:test');
const { spawnSync } = require('child_process');
const path = require('path');
const cli = path.join(__dirname, '..', 'bin', 'trust-kit.js');
const fx = (f) => path.join(__dirname, 'fixtures', f);
const run = (...a) => {
  const r = spawnSync(process.execPath, [cli, ...a], { encoding: 'utf8', timeout: 10000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
test('no args -> usage + exit 1', () => {
  const r = run();
  if (r.code !== 1 || !/onboard/.test(r.out)) throw new Error(`${r.code}\n${r.out}`);
});
test('--help -> usage + exit 0', () => {
  const r = run('--help');
  if (r.code !== 0 || !/verify-payment/.test(r.out)) throw new Error(r.out);
});
test('dispatch onboard happy -> SAFE TO PROCEED', () => {
  const r = run('onboard', fx('good-card.json'));
  if (r.code !== 0 || !r.out.includes('SAFE TO PROCEED')) throw new Error(`${r.code}\n${r.out}`);
});
test('unknown subcommand -> exit 1', () => {
  const r = run('bogus');
  if (r.code !== 1) throw new Error(r.out);
});
test('dispatch verify-payment honest -> PAYMENT VERIFIED', () => {
  const TX = '0x' + 'b'.repeat(64), W = '0x' + 'c'.repeat(40);
  const r = run('verify-payment', TX, '--to', W, '--cents', '250', '--fixtures', fx('pay-good.json'));
  if (r.code !== 0 || !r.out.includes('PAYMENT VERIFIED')) throw new Error(`${r.code}\n${r.out}`);
});
