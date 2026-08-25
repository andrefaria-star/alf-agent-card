#!/usr/bin/env bash
# BUYER ARC - vet an agent before sending it money. Fully offline.
# Usage: bash examples/buyer.sh [repo-root] [card-path]
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="${1:-$HERE}"; BIN="$ROOT/bin"
RUN=$(mktemp -d); trap 'rm -rf "$RUN"' EXIT
CARD="${2:-}"

if [ -z "$CARD" ]; then
  echo "[0/4] no card given - scaffolding a sample seller to vet"
  W="0x$(printf 'ab%.0s' {1..20})"
  mkdir -p "$RUN/shop/.well-known"; cd "$RUN/shop"
  cat > .well-known/agent-card.json <<EOFJ
{"schema":"x402.agent-card/v1","id":1,"type":"https://eip-8004.schema/agent-card","name":"Sample Seller","description":"Sells automated translation of short texts for USDC via x402.","wallet":{"address":"$W","chain":"base","currency":"USDC"},"services":[{"id":"translate","name":"Translate 500 words","priceCents":250}],"trustSurfaces":{"catalog":"catalog.json","receipts":"receipts.jsonl"}}
EOFJ
  cat > catalog.json <<EOFC
{"schema":"x402.catalog/v1","seller":"$W","items":[{"id":"translate","name":"Translate 500 words","priceCents":250}]}
EOFC
  CARD="$RUN/shop/.well-known/agent-card.json"
fi
CASEDIR="$(dirname "$CARD")"; SHOPDIR="$CASEDIR"
[ "$(basename "$CASEDIR")" = ".well-known" ] && SHOPDIR="$(dirname "$CASEDIR")"

echo "[1/4] identity check"
node "$BIN/verify-agent-card.js" "$CARD" | tee "$RUN/id.log"
grep -q "VERDICT: card valid" "$RUN/id.log" || { echo SELLER IDENTITY FAILED; exit 1; }

echo "[2/4] terms/conformance (catalog vs card)"
CAT="$(python3 -c "import json;c=json.load(open('$CARD'));print(c.get('trustSurfaces',{}).get('catalog','catalog.json'))")"
node "$BIN/conform.js" "$SHOPDIR/$CAT" "$CARD" | tee "$RUN/conf.log"
grep -qi "VERDICT: CONFORMANT" "$RUN/conf.log" || { echo CONFORMANCE FAILED; cat "$RUN/conf.log"; exit 1; }

echo "[3/4] payment receipt verified independently (fixture mode)"
W=$(python3 -c "import json;print(json.load(open('$CARD'))['wallet']['address'])")
TX="0x$(printf 'ab%.0s' {1..32})"
printf '{"_head":"0x65","%s":{"status":"0x1","to":"%s","value":"0x2625a0","blockNumber":"0x60"}}\n' "$TX" "$W" > "$RUN/pay.json"
node "$BIN/trust-kit.js" verify-payment "$TX" --to "$W" --cents 250 --fixtures "$RUN/pay.json" | tee "$RUN/pay.log"
grep -qi "PAYMENT VERIFIED" "$RUN/pay.log" || { echo PAYMENT PROOF FAILED; exit 1; }

echo "[4/4] every claim machine-checked, none trusted"
echo "BUYER ARC COMPLETE - identity, terms, payment all verified."
