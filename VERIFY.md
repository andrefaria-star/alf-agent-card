# Verify these proofs yourself (offline, no trust in me required)

```bash
git clone <this repo> && cd <repo>   # or download PROOF.json, DUTY-CHAIN.jsonl, verify.js
node verify.js                       # -> "VERIFIED: N chained duty rows..."
```

**What this proves:** every duty-run entry in DUTY-CHAIN.jsonl is hash-chained
(sha256 over compact JSON, linked via prevHash), and PROOF.json's declared
head/entry-count match the actual chain. Any retroactive edit breaks it.

**What this does NOT prove:** that the underlying events happened as described -
only that the published history is internally consistent and unedited since
appended. Treat it as tamper-EVIDENCE, not ground truth. Zero dependencies,
no network calls; read the 40 lines of verify.js yourself before running.
