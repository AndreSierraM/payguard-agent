# PayGuard Agent

> PayPal AI Hackathon — natural-language payouts + risk/policy checks via the PayPal Agent Toolkit / MCP (**sandbox only**).

**PayGuard** turns a proposed payout into a guarded PayPal action: every proposal must pass a **policy engine** (spend limits, recipient allow-lists, velocity, duplicate detection) and an explicit **human confirmation** before any executor runs. Without sandbox credentials the server boots in **dry-run** mode (logs only, no network calls).

- Hackathon: PayPal AI Hackathon on Devpost (deadline ~Nov 12, 2026 PT)
- Devpost submission: https://devpost.com/submit-to/31302-paypal-ai-hackathon/manage/submissions
- Owner: Andrés Sierra — [@AndreSierraM](https://github.com/AndreSierraM) — sierraa348@gmail.com
- License: MIT

## What works today

| Mode | When | Behavior |
| --- | --- | --- |
| **dry-run** (default) | Missing `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`, or `PAYPAL_ENV=live` | HTTP API + policy engine fully usable. Confirm logs the payout and returns `{ mode: "dry-run" }`. **No PayPal API calls.** |
| **sandbox** | Both creds set and `PAYPAL_ENV=sandbox` | Lazy-loads `@paypal/agent-toolkit/ai-sdk` (`PayPalAgentToolkit`). Confirm constructs the toolkit; map tool calls when you paste sandbox creds. |

Live/prod is refused: `PAYPAL_ENV=live` forces dry-run. Never use production MCP (`mcp.paypal.com`).

## Architecture

```
POST /payouts/propose ──► policy engine (src/policy)
                              │ fail → 400 + violations
                              ▼ pass
                         pending proposal (in-memory)
                              │
POST /payouts/confirm ──► human confirm stub
                              │
                         PayoutExecutor
                    ┌─────────┴─────────┐
                    dry-run          sandbox toolkit
                 (log only)    (@paypal/agent-toolkit)
```

Optional later: NL layer (BYO `OPENAI_API_KEY` — hackathon has **no free LLM credits**).

## Setup

Requires Node.js **>= 20.12** (uses `process.loadEnvFile`).

```bash
git clone https://github.com/AndreSierraM/payguard-agent.git
cd payguard-agent
npm i
cp .env.example .env   # optional — server starts without PayPal creds
npm test               # policy + executor unit tests (offline)
npm run build
npm start              # or: npm run dev
```

Dry-run without any secrets:

```bash
# no .env needed
npm run build && npm start
curl -s localhost:3000/health
# → {"ok":true,"service":"payguard-agent","mode":"dry-run",...}
```

## Paste sandbox credentials later

1. Log in at https://developer.paypal.com/ (a regular PayPal account works).
2. **Apps & Credentials** → **Sandbox** toggle:  
   https://developer.paypal.com/dashboard/applications/sandbox
3. Default Application or **Create App** → copy **Client ID** and **Secret**.
4. Put them in `.env` (never commit `.env`):

```env
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_ENV=sandbox
PORT=3000
```

5. Restart. `GET /health` should report `"mode":"sandbox"`.

Sandbox buyer/business accounts: **Testing Tools → Sandbox Accounts**.

## HTTP API

Listens on `process.env.PORT || 3000` (Render injects `PORT`).

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | `{ ok, mode: "dry-run" \| "sandbox" }` |
| `GET` | `/policies` | Current default policy config |
| `POST` | `/payouts/propose` | Body `{ amount, currency, recipient, memo?, reference?, idempotencyKey? }` → policy check; on pass `{ status: "pending_confirmation", proposalId, proposal, policy }`; on fail `400` + `violations` |
| `POST` | `/payouts/confirm` | Body `{ proposalId }` → run executor (dry-run or sandbox toolkit); `404` if unknown |

Example dry-run flow:

```bash
# Propose
curl -s -X POST localhost:3000/payouts/propose \
  -H 'content-type: application/json' \
  -d '{"amount":50,"currency":"USD","recipient":"contractor@example.com","memo":"Oct invoice"}'

# Confirm (use proposalId from previous response)
curl -s -X POST localhost:3000/payouts/confirm \
  -H 'content-type: application/json' \
  -d '{"proposalId":"<id>"}'
```

Default policies (see `GET /policies` / `src/policy/defaults.ts`):

- Per-tx limit: **500**
- Daily/window spend: **2000** / 24h
- Allow-list: **empty** (all recipients allowed until you populate it)
- Velocity: **10** payouts / hour
- Duplicate: same recipient+amount+memo (or idempotencyKey) within 1h

## PayPal Agent Toolkit & MCP

| Package | Version | Notes |
| --- | --- | --- |
| [`@paypal/agent-toolkit`](https://www.npmjs.com/package/@paypal/agent-toolkit) | ~1.11.0 | Subpaths: `/ai-sdk`, `/openai`, `/langchain`, `/bedrock`, `/mcp` |
| [`@paypal/mcp`](https://www.npmjs.com/package/@paypal/mcp) | optional | Local MCP: `npx -y @paypal/mcp --tools=all` |

Sandbox MCP (use these):

| | URL |
| --- | --- |
| SSE | `https://mcp.sandbox.paypal.com/sse` |
| HTTP | `https://mcp.sandbox.paypal.com/http` |

> ⚠️ `https://mcp.paypal.com/sse` is **production**. PayGuard constants and docs point only at sandbox.

Toolkit constructor (sandbox path, after creds exist):

```ts
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';
const paypalToolkit = new PayPalAgentToolkit({
  clientId: process.env.PAYPAL_CLIENT_ID,
  clientSecret: process.env.PAYPAL_CLIENT_SECRET,
  configuration: { actions: { /* enable payout actions as needed */ } },
});
```

Dry-run never constructs the toolkit.

## Scripts

| Script | Command |
| --- | --- |
| `npm test` | `tsx --test src/**/*.test.ts` (node:test, offline) |
| `npm run build` | `tsc` → `dist/` |
| `npm start` | `node dist/index.js` |
| `npm run dev` | `tsx watch src/index.ts` |

## Deploy to Render

- **Build:** `npm ci && npm run build`
- **Start:** `npm start`
- **Port:** listen on `PORT` (already wired)
- Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox` in the Render dashboard when ready. App starts in dry-run without them.

## Key source layout

```
src/
  index.ts              # boot + HTTP listen
  api/server.ts         # Express routes
  api/proposals.ts      # in-memory pending proposals
  policy/               # types, defaults, store, evaluatePolicies + tests
  paypal/client.ts      # config loader (strict + soft)
  paypal/executor.ts    # DryRunExecutor | SandboxToolkitExecutor
  paypal/mcp.ts         # sandbox MCP URL constants
```

## Security

- Sandbox only. Never commit `.env` or real credentials.
- All payouts require policy pass + explicit confirm.
- Missing creds → dry-run warn, not crash.

## License

MIT — see [LICENSE](LICENSE).
