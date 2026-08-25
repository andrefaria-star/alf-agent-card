// MCP surface contract: handshake, listing, calls green+red, unknown method.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const path = require('path'), os = require('os'), fs = require('fs');

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'bin', 'mcp-server.js')],
    { stdio: ['pipe', 'pipe', 'pipe'] });
  const waiters = [];
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try { const m = JSON.parse(line); waiters.forEach((w) => w(m)); } catch {}
    }
  });
  const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');
  const rpc = (method, params, id) => new Promise((res) => {
    const w = (m) => { if (m.id === id) { waiters.splice(waiters.indexOf(w), 1); res(m); } };
    waiters.push(w); send({ jsonrpc: '2.0', id, method, params });
  });
  const killer = setTimeout(() => child.kill('SIGKILL'), 25000);
  return { child, send, rpc, close: () => { clearTimeout(killer); child.kill('SIGTERM'); } };
}

test('handshake + tools/list exposes >=5 tools', async () => {
  const s = startServer();
  try {
    const init = await s.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } }, 1);
    assert.equal(init.result.serverInfo.name, 'x402-trust-kit');
    const list = await s.rpc('tools/list', {}, 2);
    assert.ok(list.result.tools.length >= 5, `only ${list.result.tools.length} tools`);
    assert.ok(list.result.tools.some((t) => t.name === 'verify_card'));
  } finally { s.close(); }
});

test('tools/call verify_card green + red polarities', async () => {
  const s = startServer();
  try {
    await s.rpc('initialize', {}, 10);
    const good = await s.rpc('tools/call', { name: 'verify_card', arguments: { path_or_url: path.join(__dirname, '..', '.well-known', 'agent-card.json') } }, 11);
    assert.equal(good.result.isError, false, JSON.stringify(good.result));
    assert.ok(good.result.content[0].text.includes('PASS 7/7'), good.result.content[0].text);
    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpbad-'));
    const badFile = path.join(badDir, 'card.json');
    fs.writeFileSync(badFile, JSON.stringify({ schema: 'x402.agent-card/v1', name: 'x', description: 'too short', wallet: { address: 'nope' } }));
    const bad = await s.rpc('tools/call', { name: 'verify_card', arguments: { path_or_url: badFile } }, 12);
    assert.equal(bad.result.isError, true);
  } finally { s.close(); }
});

test('run_demo returns verified walkthrough', async () => {
  const s = startServer();
  try {
    await s.rpc('initialize', {}, 20);
    const d = await s.rpc('tools/call', { name: 'run_demo', arguments: {} }, 21);
    assert.equal(d.result.isError, false);
    assert.match(d.result.content[0].text, /VERIFIED|PROVEN|ok/i);
  } finally { s.close(); }
});

test('unknown method -> -32601', async () => {
  const s = startServer();
  try {
    await s.rpc('initialize', {}, 30);
    const r = await s.rpc('bogus/method', {}, 31);
    assert.equal(r.error.code, -32601);
  } finally { s.close(); }
});
