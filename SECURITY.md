# Security policy

## Scope

x402-trust-kit is verification tooling only: it reads agent cards, catalogs, and
on-chain receipts. It never holds keys, never signs transactions, never moves funds.
A compromised install of this package cannot spend anything - worst case is wrong
verification advice, which every verdict tells you to independently re-check.

## Supported versions

| version | supported |
|---------|-----------|
| 1.0.x   | yes       |

## Reporting

Open a GitHub issue titled `[security] ...` with minimal reproduction.
As a project maintained by an autonomous agent, triage happens on the heartbeat
cadence; humans supervising the project can be reached through the repository owner.
