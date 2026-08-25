#!/usr/bin/env node
'use strict';
// x402-mcp - Model Context Protocol server (stdio) exposing the trust kit to
// other AGENTS. Hand-rolled JSON-RPC 2.0, zero dependencies.
// Tools reuse the proven CLI surfaces via subprocess so behavior == docs.
const { spawnSync } = require('child_process');
const path = require('path');
const BIN = (f) => path.join(__dirname, f);

const SERVER_INFO = { name: 'x402-trust-kit', version: '1.0.0' };

const TOOLS = [
  {
    name: 'verify_card',
    description: 'Validate an x402 agent card (schema, name, description>=20 chars, EVM wallet). Returns CONFORMANT or the violation list.',
    inputSchema: { type: 'object', properties: { path_or_url: { type: 'string', description: 'Path or https URL to agent card JSON' } }, required: ['path_or_url'] },
  },
  {
    name: 'verify_catalog',
    description: 'Validate an x402.catalog/v1 document (seller address, unique item ids, priceCents integrity). Returns CONFORMANT or violations.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
  {
    name: 'onboard',
    description: 'Full seller/buyer on-ramp: identity verify -> conformance -> payment instructions. JSON verdict.',
    inputSchema: { type: 'object', properties: { card: { type: 'string' } }, required: ['card'] },
  },
  {
    name: 'verify_payment',
    description: 'Verify an on-chain USDC payment receipt independently (status, recipient, amount, confirms) against expected values.',
    inputSchema: { type: 'object', properties: { tx: { type: 'string' }, expect_to: { type: 'string' }, expect_cents: { type: 'number' } }, required: ['tx'] },
  },
  {
    name: 'run_demo',
    description: 'Run the offline end-to-end walkthrough of the whole kit. No wallet or network needed.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

function callTool(name, args) {
  const a = args || {};
  let cmd, cargs;
  switch (name) {
    case 'verify_card': cmd = process.execPath; cargs = [BIN('verify-agent-card.js'), String(a.path_or_url || '')]; break;
    case 'verify_catalog': cmd = process.execPath; cargs = [BIN('verify-catalog.js'), String(a.path || '')]; break;
    case 'onboard': cmd = process.execPath; cargs = [BIN('onboard.js'), String(a.card || ''), '--json']; break;
    case 'verify_payment':
      cmd = process.execPath;
      cargs = [BIN('verify-payment.js'), String(a.tx || ''), '--expect-to', String(a.expect_to || ''), '--expect-cents', String(a.expect_cents ?? '')];
      break;
    case 'run_demo': cmd = process.execPath; cargs = [BIN('trust-kit.js'), 'demo']; break;
    default: return { error: { code: -32602, message: `unknown tool: ${name}` } };
  }
  const r = spawnSync(cmd, cargs, { encoding: 'utf8', timeout: 20000 });
  const text = (r.stdout || r.stderr || '').trim() || '(no output)';
  return {
    content: [{ type: 'text', text }],
    isError: r.status !== 0,
  };
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (!msg || msg.jsonrpc !== '2.0') continue;
    const reply = (result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n');
    switch (msg.method) {
      case 'initialize':
        reply({ protocolVersion: msg.params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: SERVER_INFO });
        break;
      case 'ping': reply({}); break;
      case 'tools/list': reply({ tools: TOOLS }); break;
      case 'tools/call': {
        const res = callTool(msg.params?.name, msg.params?.arguments);
        if (res.error) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: res.error }) + '\n');
        else reply(res);
        break;
      }
      default:
        if (msg.id !== undefined)
          process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: `method not found: ${msg.method}` } }) + '\n');
    }
  }
});
process.stdin.on('end', () => process.exit(0));
