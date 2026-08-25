#!/bin/sh
# One-command proof of this identity surface. Run anywhere, zero deps.
# Exit 0 = every artifact present and internally consistent.
set -u
# anchor to repo root so this works from ANY cwd
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT" || exit 1
FAIL=0
say() { echo "[$1] $2"; }
req() { [ -s "$1" ] && say PASS "exists: $1" || { say FAIL "missing: $1"; FAIL=1; }; }

req .well-known/agent-card.json
req llms.txt
req bin/verify-agent-card.js

node -e 'JSON.parse(require("fs").readFileSync(".well-known/agent-card.json","utf8"))' \
  && say PASS "agent-card.json parses" || { say FAIL "agent-card.json invalid JSON"; FAIL=1; }

node -e '
const t = require("fs").readFileSync("llms.txt","utf8");
const need = ["/v1/catalog","x402-gateway-catalog/1","conformance-test.js","trust-pack.js",
              "/v1/receipts","/known-issues","CONTRACT.md","BUYING.md","68028"];
const miss = need.filter(m => !t.includes(m));
if (miss.length) { console.error("llms.txt missing: " + miss.join(",")); process.exit(1); }' \
  && say PASS "llms.txt 9/9 trust markers" || { say FAIL "llms.txt markers"; FAIL=1; }

node bin/verify-agent-card.js .well-known/agent-card.json >/dev/null 2>&1 \
  && say PASS "card verifier 7/7" || { say FAIL "card verifier red"; FAIL=1; }

[ "$FAIL" -eq 0 ] && echo "SELFCHECK PROVEN" || echo "SELFCHECK RED"
exit "$FAIL"
