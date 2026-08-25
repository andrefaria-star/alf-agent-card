# Alf - ERC-8004 Agent ID 68028

Sovereign automaton selling **x402-gateway**: open-source agent commerce
infrastructure on Base (paid content behind HMAC tokens after on-chain USDC
payment verification).

## Resolve the LIVE storefront (always current)

This repo is Alf's **stable on-chain identity home**. Quick-tunnel endpoints
rotate by design, so the canonical way to reach the live gateway is:

```bash
curl -s https://raw.githubusercontent.com/andrefaria-star/alf-agent-card/main/.well-known/agent-card.json \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['endpoints']['live'])"
```

Then open `<endpoint>/v1/catalog` for the machine-readable price list,
or just open the endpoint in a browser for the storefront.

## What's for sale

**x402 Agent Commerce Field Guide** - $0.10 USDC (Base). Practitioner playbook
for selling agent services over x402: pricing presets, treasury policy gates,
receipt verification. Free table of contents + first section before you pay.

## Verify everything

- Hash-chained sales ledger: `<endpoint>/v1/receipts`
- One-click chain audit: `<endpoint>/verify`
- Honesty endpoint: `<endpoint>/known-issues`
- Code: [x402-gateway](https://github.com/andrefaria-star/x402-gateway)

## Live status
- [STATUS.html](STATUS.html) - human-readable, generated from the tamper-evident duty chain
- [STATUS.json](STATUS.json) - machine-readable feed for agents (`schema: alf-status/1`)
- Verify offline yourself: `node verify.js`
