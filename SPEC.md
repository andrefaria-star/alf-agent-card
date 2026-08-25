# x402 agent commerce spec (v1)

Normative contract implemented by `x402-trust-kit`. Any seller or buyer tool that
conforms to this document interoperates with the whole kit. Versioning: breaking
changes bump the schema suffix (`/v2`); v1 parsers MUST reject unknown schemas
rather than guess.

## Agent card (`x402.agent-card/v1`)

| field              | req | rule |
|--------------------|-----|------|
| `schema`           | yes | exactly `x402.agent-card/v1` |
| `name`             | yes | non-empty string |
| `description`      | yes | >= 20 chars, honest capability claim |
| `wallet.address`   | yes | EVM address `^0x[0-9a-fA-F]{40}$` |
| `catalogUrl`       | no  | absolute URL; if relative-to-file, consumers resolve against card location |

A card is CONFORMANT iff all required fields pass. `verify-card` exits 0 only then.

## Catalog (`x402.catalog/v1`)

| field           | req | rule |
|-----------------|-----|------|
| `schema`        | yes | exactly `x402.catalog/v1` |
| `paymentScheme` | no  | default+only `exact`; unknown values are NON-CONFORMANT |
| `seller`        | yes | EVM address; SHOULD equal the card's `wallet.address` |
| `items[]`       | yes | >= 1 item |

Item rules: unique `id` (fallback key: title); payable price via canonical
`priceCents` (integer >= 0) or `price` in USD converted at 100 cents/unit;
fractional cents are NON-CONFORMANT; `description` optional string.

## Payment

Price unit is USDC cents on Base (6 decimals): `value = priceCents * 10_000`.
Buyers send >= price to the catalog `seller`. Underpayment settles nothing.

## Settlement endpoint (reference: `settle`)

`POST /v1/settle {"txHash": "0x<64hex>"}` ->
- `200 {ok:true, secret, paid}` - server independently verified receipt (status 0x1,
  recipient == seller, paidCents >= price, confirms >= min)
- `400` malformed body/hash · `402` not-found/reverted/wrong-recipient/underpaid/unconfirmed
- `409` replay (txHash already settled, dedupe persists in tamper-evident jsonl ledger)
- `502` upstream RPC failure

Servers MUST NOT trust client claims; verification is always server-side.

## Ledgers (settlement receipts)

One JSON object per line: `{seq, ts, txHash, paidCents, prevHash, hash}`;
`hash = sha256(JSON({seq,ts,txHash,paidCents,prevHash}))`, first `prevHash=null`.
`verify-ledger` recomputes every row; any edit/reorder/deletion breaks VALIDITY.

## Exit codes & verdicts (all kit commands)

| code | meaning |
|------|---------|
| 0    | safe / verified / conformant / valid |
| 1    | check failed (reason printed, machine-greppable VERDICT line first) |
| 2    | input missing/unreachable |

Verdict strings: `SAFE TO PROCEED`, `CONFORMANT`, `PAYMENT VERIFIED`,
`LEDGER VALID`, and their negative counterparts. Tools print ALL violations
per run (no fail-fast) so sellers fix everything in one pass.
