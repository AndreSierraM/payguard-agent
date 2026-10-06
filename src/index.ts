import { loadPayPalConfig, MissingPayPalCredentialsError } from "./paypal/client.js";

/**
 * PayGuard Agent — entry point (stub).
 *
 * Where things will plug in:
 *  1. PayPal client: `loadPayPalConfig()` (src/paypal/client.ts) -> pass the
 *     config to the PayPal Agent Toolkit (`@paypal/agent-toolkit`) or connect
 *     to the hosted PayPal MCP server (sandbox: https://mcp.sandbox.paypal.com/sse ; production: https://mcp.paypal.com/sse).
 *  2. Policy engine (TODO): risk/policy checks (limits, allow-lists, velocity)
 *     evaluated BEFORE any payout tool call is executed.
 *  3. NL layer (TODO): an LLM turns a natural-language payout request into a
 *     proposed action; PayGuard validates it against policies; a human confirms.
 *  4. HTTP server (TODO): small API/UI for the Render demo, listening on PORT.
 */
function loadDotEnv(): void {
  // Node >=20.12 can read .env natively; on Render, env vars come from the dashboard.
  try {
    process.loadEnvFile(".env");
  } catch {
    /* no .env file — rely on real environment variables */
  }
}

function main(): void {
  loadDotEnv();
  console.log("[payguard] starting PayGuard Agent (scaffold)");
  try {
    const cfg = loadPayPalConfig();
    console.log(`[payguard] PayPal credentials loaded (env=${cfg.env}). Toolkit wiring: TODO`);
  } catch (err) {
    if (err instanceof MissingPayPalCredentialsError) {
      console.warn(`[payguard] ${err.message}`);
    } else {
      throw err;
    }
  }
  console.log("[payguard] ready (no PayPal calls are made in this scaffold)");
}

main();
