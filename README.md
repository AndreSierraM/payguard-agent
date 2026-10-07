# PayGuard Agent

> PayPal AI Hackathon — natural-language payouts + risk/policy checks via the PayPal Agent Toolkit / MCP (**sandbox only**).

**PayGuard** turns a proposed payout into a guarded PayPal action: every proposal gets a policy **decision** (`ALLOW` | `BLOCK` | `CONFIRM`), human-readable **reasons**, and an explicit **human confirmation** before any executor runs. Without sandbox credentials the server boots in **dry-run** mode (stub payout ids, no network calls).

- Hackathon: PayPal AI Hackathon on Devpost (deadline ~Nov 12, 2026 PT)
- Devpost submission: https://devpost.com/submit-to/31302-paypal-ai-hackathon/manage/submissions
- Owner: Andrés Sierra — [@AndreSierraM](https://github.com/AndreSierraM) — sierraa348@gmail.com
- License: MIT

## What works today (P0 — no PayPal login)

| Mode | When | Behavior |
| --- | --- | --- |
| **dry-run** (default) | Missing `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`, or `PAYPAL_ENV=live` | Policy engine + HTTP + demo UI fully usable. Confirm returns stub `PAYOUT-DRY-<uuid>`. **No PayPal API calls.** |
| **sandbox** (phase 2) | Both creds set and `PAYPAL_ENV=sandbox` | Lazy-loads `@paypal/agent-toolkit/ai-sdk`. Wire real payout tool calls when sandbox creds exist. |

Live/prod is refused: `PAYPAL_ENV=live` forces dry-run. Never use production MCP (`mcp.paypal.com`).

### Policy decisions

| Decision | When | Next step |
| --- | --- | --- |
| **ALLOW** | Recipient on allow-list + all hard checks pass | Human Confirm → stub (or sandbox) payout |
| **CONFIRM** | Recipient **not** on allow-list (or allow-list **empty**) + no hard fail | Human Confirm still required (new / untrusted payee) |
| **BLOCK** | Hard fail: per-tx / daily / velocity / duplicate / invalid amount | Stop — no confirm |

**Empty allow-list ≠ allow-all.** Unknown payees never silently pass.

Seed allow-list (unless `PAYGUARD_ALLOW_LIST` overrides): `alice@example.com`, `bob@example.com`, `dana@example.com`. **Charlie is not seeded** (demo CONFIRM).

Default caps: per-tx **500**, daily **2000** (override with `PAYGUARD_PER_TX_LIMIT` / `PAYGUARD_DAILY_LIMIT`).

## Demo theater (UI)

```bash
npm i && npm run build && npm start
# open http://localhost:3000/
```

| Intent | Expected |
| --- | --- |
| Pay Bob $2500 | **BLOCK** (over per-tx 500) |
| Pay Charlie $90 | **CONFIRM** (new payee) |
| Pay Alice $50 | **ALLOW** |

## Natural-language intent (first-class API field)

The `POST /payouts/propose` endpoint accepts an `intent` string alongside or instead of structured fields. Supported shapes (case-insensitive):

| Intent example | Parsed amount | Currency | Recipient | Memo |
| --- | --- | --- | --- | --- |
| `Pay Bob $2500` | 2500 | USD | bob@example.com | NL payout |
| `send 90 dollars to charlie@example.com for lunch` | 90 | USD | charlie@example.com | lunch |
| `transfer $50 to Alice memo October invoice` | 50 | USD | alice@example.com | October invoice |
| `please pay dana 120 USD — contractor fee` | 120 | USD | dana@example.com | contractor fee |

Memo markers (all work): `for`, `memo`, `notes`, `—` (em dash), `-` (hyphen). Currency: `$` prefix, ISO code (USD, EUR, GBP…), or words (dollars, euros, pounds). Recipient: email or seed name (alice/bob/charlie/dana).

## Judges: set X-API-Key

Protected routes: `POST /payouts/propose`, `POST /payouts/confirm`, `POST /payouts/cancel`, `GET /audit`.

```http
X-API-Key: payguard-demo-key
```

- Default when `PAYGUARD_API_KEY` is unset: **`payguard-demo-key`** (so `npm start` works out of the box).
- Set a custom value in `.env` / Render for non-demo deploys.
- Open routes: `GET /`, static UI, `GET /health`, `GET /policies`.

## Setup

Requires Node.js **>= 20.12** (uses `process.loadEnvFile`).

```bash
git clone https://github.com/AndreSierraM/payguard-agent.git
cd payguard-agent
npm i
cp .env.example .env   # optional — server starts without PayPal creds
npm test
npm run build
npm start              # or: npm run dev
```

## Demo script (curl)

```bash
export KEY=payguard-demo-key
export H="content-type: application/json"
# no .env / no PayPal creds needed
npm run build && npm start &
sleep 1

# Happy ALLOW — Alice $50
curl -s -X POST localhost:3000/payouts/propose \
  -H "$H" -H "X-API-Key: $KEY" \
  -d '{"intent":"Pay Alice $50"}' | tee /tmp/allow.json
# → decision: ALLOW, proposalId: ...

curl -s -X POST localhost:3000/payouts/confirm \
  -H "$H" -H "X-API-Key: $KEY" \
  -d "{\"proposalId\":\"$(jq -r .proposalId /tmp/allow.json)\"}"
# → payoutId: PAYOUT-DRY-...

# BLOCK — Bob $2500
curl -s -X POST localhost:3000/payouts/propose \
  -H "$H" -H "X-API-Key: $KEY" \
  -d '{"intent":"Pay Bob $2500"}'
# → decision: BLOCK, reasons mention per-transaction limit

# CONFIRM — Charlie $90 (new payee), then confirm stub
curl -s -X POST localhost:3000/payouts/propose \
  -H "$H" -H "X-API-Key: $KEY" \
  -d '{"intent":"Pay Charlie $90"}' | tee /tmp/confirm.json
# → decision: CONFIRM

curl -s -X POST localhost:3000/payouts/confirm \
  -H "$H" -H "X-API-Key: $KEY" \
  -d "{\"proposalId\":\"$(jq -r .proposalId /tmp/confirm.json)\"}"
# → payoutId: PAYOUT-DRY-...

# Audit trail
curl -s localhost:3000/audit -H "X-API-Key: $KEY"
```

Field-based propose (same auth):

```bash
curl -s -X POST localhost:3000/payouts/propose \
  -H 'content-type: application/json' -H "X-API-Key: $KEY" \
  -d '{"amount":50,"currency":"USD","recipient":"alice@example.com","memo":"Oct invoice"}'
```

## Architecture

```
GET  /                     demo UI (public/)
POST /payouts/propose ──► policy engine → ALLOW | BLOCK | CONFIRM
                              │ BLOCK → 200 + decision (no pending)
                              ▼ ALLOW / CONFIRM
                         pending proposal + audit(propose)
                              │
POST /payouts/confirm ──► human confirm
                              │
                         DryRunExecutor → PAYOUT-DRY-<uuid>
                         (phase 2: sandbox toolkit)
GET  /audit                append-only propose/block/confirm/cancel
```

HTTP **200** always carries `decision` / `reasons` / `ruleHits` for propose (UI-friendly). **400** only for malformed bodies. **401** if `X-API-Key` missing/wrong on protected routes.

## Paste sandbox credentials later (phase 2)

1. Log in at https://developer.paypal.com/
2. **Apps & Credentials** → **Sandbox**: https://developer.paypal.com/dashboard/applications/sandbox
3. Copy Client ID + Secret into `.env`:

```env
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_ENV=sandbox
```

4. Restart → `GET /health` reports `"mode":"sandbox"`. Then wire toolkit payout tool invocation in `SandboxToolkitExecutor`.

## PayPal Agent Toolkit & MCP

| | URL |
| --- | --- |
| SSE | `https://mcp.sandbox.paypal.com/sse` |
| HTTP | `https://mcp.sandbox.paypal.com/http` |

> ⚠️ `https://mcp.paypal.com/sse` is **production**. Do not use it.

## Scripts

| Script | Command |
| --- | --- |
| `npm test` | offline unit tests |
| `npm run build` | `tsc` → `dist/` |
| `npm start` | `node dist/index.js` |
| `npm run dev` | `tsx watch src/index.ts` |

## Deploy to Render

- **Build:** `npm ci && npm run build`
- **Start:** `npm start`
- **Port:** `PORT`
- Set `PAYGUARD_API_KEY` (and later PayPal sandbox creds) in the dashboard.

## Key source layout

```
src/
  index.ts
  api/server.ts auth.ts proposals.ts
  audit/log.ts
  intent/parse.ts
  policy/          types, defaults, config(env), engine, store
  paypal/          dry-run + sandbox executor, mcp constants
public/index.html  demo UI
```

## Out of scope (cut for P0)

Multi-agent, KYC, webhooks, Stripe, analytics, mobile, auto-approve, real PayPal wire (phase 2).

## License

MIT — see [LICENSE](LICENSE).
