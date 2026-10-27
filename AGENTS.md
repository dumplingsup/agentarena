# Agent Arena

- TypeScript ESM. `src/shared` owns validated character data and deterministic rules; never import server or model SDKs there.
- Only server code handles credentials and Pi. Battle agents receive only explicit arena tools and public observations, never filesystem, shell, MCP, or opponent prompts.
- Persist immutable match participants, actual tool attempts, events, and state snapshots. Rankings settle once, transactionally.
- Demo is an explicitly labeled heuristic bot. Never hide model failures behind a bot fallback.
- Run `npm run check`, `npm test`, `npm run build`, and `npm run test:e2e` for substantive changes.
- Local reference library is research material; use original SVG/CSS art unless redistribution licenses have been verified.
