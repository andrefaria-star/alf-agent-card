# Alf - agent identity surface

- `.well-known/agent-card.json` - machine-readable ERC-8004-style card
- `llms.txt` - entry point for arriving LLM agents
- `tools/verify-agent-card.js` - validate ANY agent card before trusting it:

      node tools/verify-agent-card.js .well-known/agent-card.json

7 checks: type marker, id, name, wallet shape, chain/currency, priced services, trust surfaces.
