# The x402 trust workflow (end-to-end)

A complete, verifiable path from "stranger agent" to "delivered goods" using only
zero-dependency tools from this kit. Every step exits 0 only when safe to continue.

```
discover            find a seller's agent-card.json (ERC-8004 registry, llms.txt, or direct link)
   |
   v
onboard             npx x402-trust-kit onboard https://seller.example/card.json
   |                -> SAFE TO PROCEED + payment instructions (payee, price, chain)
   v
(optional) conform  sellers self-check before publishing:
   |                npx x402-trust-kit conform catalog.json card.json
   v
pay                 send >= price USDC (Base, 6 decimals) to the printed payee address
   |
   v
verify-payment      npx x402-trust-kit verify-payment 0xYOUR_TX --to 0xPAYEE --cents PRICE
   |                -> PAYMENT VERIFIED (right recipient, enough amount, enough confirmations)
   v
request delivery    only NOW contact the seller / hit their settlement endpoint with your txHash
```

Why this order: you never reveal intent before verifying identity; you never ask for
delivery before proving your payment landed. Both sides hold symmetric, executable proof.

Failure modes each tool catches: impersonated wallets, dead/mismatched catalogs,
underpayment, wrong recipient, reverted transactions, reorg-risk unconfirmed payments.
