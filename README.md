# PayGuard Agent

> PayPal AI Hackathon — natural-language payouts + risk/policy checks via the PayPal Agent Toolkit / MCP (**sandbox only**).

**PayGuard** is an agent that lets an operator say things like *"pay the 3 approved contractors their October invoices"* and turns that into concrete PayPal actions — but only after every proposed action passes a set of **risk policies** (spend limits, recipient allow-lists, velocity checks, duplicate detection) and an explicit human confirmation. The idea: give AI agents payment powers *with guardrails*.

Status: **scaffold**. No PayPal API calls are made yet.

- Hackathon: PayPal AI Hackathon on Devpost (deadline ~Nov 12, 2026 PT)
- Devpost submission: https://devpost.com/submit-to/31302-paypal-ai-hackathon/manage/submissions
- Owner: Andrés Sierra — [@AndreSierraM](https://github.com/AndreSierraM) — sierraa348@gmail.com

## Architecture (planned)

```
NL request ──► LLM (optional, BYO key) ──► proposed action
                                              │
                                   PayGuard policy engine (src/, TODO)
                                              │ pass + human confirm
                                              ▼
                     PayPal Agent Toolkit  /  PayPal MCP server (sandbox)
```

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Entry point; logs startup, loads `.env`, documents plug-in points |
| `src/paypal/client.ts` | Reads `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_ENV`; throws a clear error if missing |

## Setup

Requires Node.js **>= 20.12** (uses `process.loadEnvFile`).

```bash
git clone https://github.com/AndreSierraM/payguard-agent.git
cd payguard-agent
npm i
cp .env.example .env    # then fill in sandbox credentials (never commit .env)
npm run dev             # tsx watch mode
# or
npm run build && npm start
```

## Getting sandbox credentials

1. Log in at https://developer.paypal.com/ (a regular PayPal account works).
2. Go to **Apps & Credentials** → make sure the **Sandbox** toggle is selected:
   https://developer.paypal.com/dashboard/applications/sandbox
3. Use the *Default Application* or click **Create App**.
4. Copy the **Client ID** and **Secret** into `.env` as `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`. Keep `PAYPAL_ENV=sandbox`.
5. Sandbox test buyer/business accounts live under **Testing Tools → Sandbox Accounts** in the same dashboard.

Reference: https://developer.paypal.com/api/rest/ and https://developer.paypal.com/api/rest/sandbox/

## PayPal Agent Toolkit & MCP pointers

Verified npm packages (Oct 2026):

| Package | Version seen | What it is |
| --- | --- | --- |
| [`@paypal/agent-toolkit`](https://www.npmjs.com/package/@paypal/agent-toolkit) | 1.11.0 | "PayPal toolkit for AI agent workflows in typescript". Subpath exports: `/ai-sdk`, `/openai`, `/langchain`, `/bedrock`, `/mcp` |
| [`@paypal/mcp`](https://www.npmjs.com/package/@paypal/mcp) | 1.8.1 | CLI to run the PayPal MCP server locally (`npx -y @paypal/mcp --tools=all`) |

Docs:

- Agent Toolkit source + examples: https://github.com/paypal/agent-toolkit
- Agent Toolkit announcement: https://developer.paypal.com/community/blog/paypal-agent-toolkit/
- MCP server quickstart: https://developer.paypal.com/tools/mcp-server/
- Postman: https://www.postman.com/paypal/paypal-public-api-workspace

Remote MCP endpoints (from the quickstart above):

| Environment | SSE | Streamable HTTP |
| --- | --- | --- |
| **Sandbox** | `https://mcp.sandbox.paypal.com/sse` | `https://mcp.sandbox.paypal.com/http` |
| Production | `https://mcp.paypal.com/sse` | `https://mcp.paypal.com/http` |

> ⚠️ `https://mcp.paypal.com/sse` is the **production** endpoint. For hackathon/sandbox work use `https://mcp.sandbox.paypal.com/sse`.

Install the toolkit when wiring real calls (not installed yet, intentionally):

```bash
npm i @paypal/agent-toolkit
```

Follow the toolkit README for the exact constructor/config shape — this repo intentionally does not guess at API request shapes.

## LLM

The hackathon provides **no free LLM credits**. `OPENAI_API_KEY` in `.env.example` is an optional placeholder — bring your own key for whichever provider/framework you pick (the toolkit has OpenAI, Vercel AI SDK, LangChain, and Bedrock adapters), or run the policy engine without an LLM.

## Deploy to Render (placeholder)

Planned: a Render **Web Service**.

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Environment: set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox` (and optional LLM key) in the Render dashboard — not in the repo.
- Render injects `PORT`; the HTTP server (TODO) should listen on it.

## Security

- Sandbox only. Never commit `.env` or real credentials.
- All payout actions must pass policy checks and explicit confirmation before execution.

## License

MIT — see [LICENSE](LICENSE).
