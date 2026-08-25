#!/usr/bin/env bash
# SELLER ARC - scaffold -> preflight -> go live -> first sale -> tamper-evident ledger
# Usage: bash examples/seller.sh [repo-root]
set -euo pipefail
ROOT="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
BIN="$ROOT/bin"
RUN=$(mktemp -d); SRV=""; trap '[ -n "$SRV" ] && kill $SRV 2>/dev/null; rm -rf "$RUN"' EXIT
W="0x$(printf 'ab%.0s' {1..20})"

echo "[1/5] scaffold your agent card + catalog"
mkdir -p "$RUN/shop/.well-known"; cd "$RUN/shop"
cat > .well-known/agent-card.json <<EOFJ
{"schema":"x402.agent-card/v1","id":1,"type":"https://eip-8004.schema/agent-card","name":"Example Seller","description":"Sells automated translation of short texts for USDC via x402.","wallet":{"address":"$W","chain":"base","currency":"USDC"},"services":[{"id":"translate","name":"Translate 500 words","priceCents":250}],"trustSurfaces":{"catalog":"catalog.json","receipts":"receipts.jsonl"}}
EOFJ
cat > catalog.json <<EOFC
{"schema":"x402.catalog/v1","seller":"$W","items":[{"id":"translate","name":"Translate 500 words","priceCents":250}]}
EOFC

echo "[2/5] pre-flight: identity + conformance (never publish unproven)"
node "$BIN/verify-agent-card.js" .well-known/agent-card.json | tee id.log
grep -q "VERDICT: card valid" id.log || { echo IDENTITY FAILED; exit 1; }
node "$BIN/conform.js" catalog.json .well-known/agent-card.json | tee conform.log
grep -qi "VERDICT: CONFORMANT" conform.log || { echo CONFORMANCE FAILED; cat conform.log; exit 1; }

echo "[3/5] go live: settlement endpoint (offline demo mode)"
TX="0x$(printf 'ab%.0s' {1..32})"
printf '{"_head":"0x65","%s":{"status":"0x1","to":"%s","value":"0x2625a0","blockNumber":"0x60"}}\n' "$TX" "$W" > fixtures.json
node "$BIN/settle-server.js" --pay-to "$W" --price-cents 250 \
  --fixtures fixtures.json --receipts "$RUN/receipts.jsonl" > server.log 2>&1 &
SRV=$!
PORT=""
for i in $(seq 1 60); do PORT=$(grep -o 'PORT=[0-9]*' server.log | cut -d= -f2 || true); [ -n "$PORT" ] && break; sleep 0.25; done
[ -n "$PORT" ] || { echo SERVER NEVER BOOTED; cat server.log; exit 1; }
BASE="http://127.0.0.1:$PORT"
echo "    listening on $BASE"

echo "[4/5] first sale lands"
CODE=$(curl -s -o sale-resp.json -w '%{http_code}' -X POST "$BASE/v1/settle" -H 'content-type: application/json' \
  -d "{\"txHash\":\"$TX\",\"to\":\"$W\",\"cents\":250}")
case "$CODE" in 200|202) echo "    accepted ($CODE)";; *) echo REJECTED $CODE; cat sale-resp.json; exit 1;; esac

echo "[5/5] prove the sales ledger was never rewritten"
kill $SRV 2>/dev/null || true; SRV=""; sleep 0.3
LEDGER="$RUN/receipts.jsonl"
[ -f "$LEDGER" ] || LEDGER=$(find "$RUN" -name '*.jsonl' | head -1)
[ -f "$LEDGER" ] || { echo NO LEDGER; exit 1; }
echo "    ledger: $LEDGER"
node "$BIN/verify-ledger.js" "$LEDGER"
echo ""; echo "SELLER ARC COMPLETE - sellable, receipts tamper-evident."
