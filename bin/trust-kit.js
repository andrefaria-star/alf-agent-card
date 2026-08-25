#!/usr/bin/env node
'use strict';
// x402-trust-kit unified CLI. Usage:
//   x402-trust-kit onboard        <cardUrl|file>            verify a seller BEFORE paying
//   x402-trust-kit conform        <catalog> [card]           prove YOUR catalog before publishing
//   x402-trust-kit verify-payment <txHash> --to --cents ... prove payment landed AFTER paying
// Exit code propagates from the underlying tool. No dependencies.
const { spawn } = require('child_process');
const path = require('path');

const TOOLS = {
  'init': 'init.js',
  'demo': 'demo.js',
  'settle': 'settle-server.js',
  'verify-ledger': 'verify-ledger.js',
  'mcp': 'mcp-server.js',
  'onboard': 'onboard.js',
  'conform': 'conform.js',
  'verify-payment': 'verify-payment.js',
  'verify-card': 'verify-agent-card.js',
};
const [, , cmd, ...rest] = process.argv;

if (!cmd || cmd === '--help' || cmd === '-h') {
  if (!cmd) console.log('try: x402-trust-kit demo   # 60-second offline walkthrough\n');
  console.log('x402-trust-kit - zero-dependency trust toolkit for x402 agent commerce\n');
  console.log('  init <dir> --wallet 0x..            scaffold a conforming store (seller quickstart)');
  console.log('  settle --pay-to .. --price-cents .. run a replay-proof settlement endpoint');
  console.log('  verify-ledger <receipts.jsonl>      prove a sales ledger was never rewritten');
  console.log('  mcp                                  serve this toolkit over MCP (stdio) for other agents');
  console.log('  onboard <cardUrl|file>              verify seller identity+catalog BEFORE paying');
  console.log('  conform <catalog> [card]            prove your own catalog conforms BEFORE publishing');
  console.log('  verify-payment <tx> --to --cents    prove payment landed on-chain AFTER paying');
  console.log('  verify-card <agentCardUrl|file>     ERC-8004-style identity check');
  console.log('\nEvery tool exits 0 only on SAFE/VERIFIED/CONFORMANT.');
  process.exit(cmd ? 0 : 1);
}

const tool = TOOLS[cmd];
if (!tool) {
  console.error(`unknown subcommand "${cmd}" - try: ${Object.keys(TOOLS).join(', ')}`);
  process.exit(1);
}
if (!require('fs').existsSync(path.join(__dirname, tool))) {
  console.error(`tool missing: ${tool} (broken install?)`);
  process.exit(1);
}
const child = spawn(process.execPath, [path.join(__dirname, tool), ...rest], { stdio: 'inherit' });
child.on('error', (e) => { console.error(e.message); process.exit(1); });
child.on('exit', (c, sig) => process.exit(c == null ? 1 : c));
