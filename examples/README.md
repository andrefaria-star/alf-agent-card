# Runnable arcs
- **seller**: `bash examples/seller.sh` - scaffold -> preflight -> live endpoint -> first sale -> tamper-evident ledger. Fully offline demo mode.
- **buyer**:  `bash examples/buyer.sh [root] [card]` - vet identity, terms, and payment proof before trusting any agent. No card arg = vets a generated sample.
Both exit 0 only when every machine-check passes. No wallet, no network, no keys required.
