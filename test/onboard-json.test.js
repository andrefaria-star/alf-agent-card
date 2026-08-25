'use strict';
/* Offline unit proof for on-ramp v2 --json contract.
 * Mock fixtures live in a DEDICATED child process (mock-server.js) so neither
 * the test parent nor the onboard child ever contends for the serving loop.
 * Proves 4 verdict polarities + exact exit-code contract. */
const { spawn } = require('child_process');
const path = require('path');

const ONBOARD = path.join(__dirname, '..', 'tools', 'onboard.js');
const MOCK    = path.join(__dirname, 'mock-server.js');

function run(args) {
  return new Promise(resolve => {
    const c = spawn('node', [ONBOARD, ...args]);
    let out = '', err = '';
    c.stdout.on('data', d => out += d);
    c.stderr.on('data', d => err += d);
    const killer = setTimeout(() => c.kill('SIGKILL'), 15000);
    c.on('close', code => { clearTimeout(killer); resolve({ rc: code, out, err }); });
  });
}
function parseJson(s) { try { return JSON.parse(s); } catch (_) { return null; } }

(async () => {
  // boot fixture server in its own process
  const base = await new Promise((resolve, reject) => {
    const m = spawn('node', [MOCK]);
    let buf = '';
    const to = setTimeout(() => reject(new Error('mock boot timeout')), 5000);
    m.stdout.on('data', d => {
      buf += d;
      const mt = buf.match(/PORT=(\d+)/);
      if (mt) { clearTimeout(to); resolve({ proc: m, url: 'http://127.0.0.1:' + mt[1] }); }
    });
    m.on('close', () => reject(new Error('mock died')));
  });
  const b = base.url;
  let fails = 0;
  const t = (name, cond, ctx) => {
    console.log((cond ? 'ok   ' : 'FAIL ') + name);
    if (!cond && ctx) console.log('     ctx:', JSON.stringify(ctx).slice(0, 400));
    if (!cond) fails++;
  };

  // GREEN: valid card + good catalog -> SAFE TO PROCEED rc=0
  {
    const r = await run([b + '/card.json', b, '--json']);
    const j = parseJson(r.out);
    t('green rc=0', r.rc === 0, { rc: r.rc, err: r.err.slice(0, 150) });
    t('green parses', !!j);
    t('green verdict', j && j.verdict === 'SAFE TO PROCEED', j && j.detail);
    t('green checks array', j && Array.isArray(j.checks) && j.checks.length > 0);
    t('green instructions', j && Array.isArray(j.instructions) && j.instructions.length >= 1);
  }
  // RED: valid card + BAD catalog -> DO NOT PAY rc=1
  {
    const r = await run([b + '/card.json', b + '/catalog-bad-base', '--json']);
    const j = parseJson(r.out);
    t('red rc=1', r.rc === 1, { rc: r.rc, detail: j && j.detail });
    t('red verdict', j && j.verdict === 'DO NOT PAY', j && j.detail);
  }
  // UNREACHABLE: valid card live, gateway dead -> GATEWAY_UNREACHABLE rc=2
  {
    const r = await run([b + '/card.json', 'http://127.0.0.1:9', '--json']);
    const j = parseJson(r.out);
    t('unreachable rc=2', r.rc === 2, { rc: r.rc });
    t('unreachable verdict', j && j.verdict === 'GATEWAY_UNREACHABLE', j && j.error);
  }
  // BADCARD: unreadable source -> UNREADABLE_CARD rc=2
  {
    const r = await run(['http://127.0.0.1:9/card.json', '--json']);
    const j = parseJson(r.out);
    t('badcard rc=2', r.rc === 2);
    t('badcard verdict', j && j.verdict === 'UNREADABLE_CARD');
  }

  base.proc.kill();
  console.log(fails ? `ONBOARD-JSON SUITE RED (${fails})` : 'ONBOARD-JSON SUITE GREEN');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e.message); process.exit(1); });
