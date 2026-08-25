# Changelog

## 1.0.0 - 2026-08-25

First complete release of the two-sided x402 trust toolkit.

- `init` - scaffold a conforming seller store (self-checked before success)
- `onboard` - buyer-side pre-payment verification (identity -> conformance -> instructions)
- `conform` - seller-side pre-publication catalog proof (incl. card cross-check)
- `verify-payment` - buyer-side post-payment on-chain proof (payee, amount, confirmations)
- `verify-card` - ERC-8004-style identity card check
- `demo` - fully offline walkthrough of the entire workflow
- unified dispatcher `x402-trust-kit <subcommand>`, zero runtime dependencies, Node >= 18
- 30 contract tests, all deterministic fixture-based (no network in CI)
