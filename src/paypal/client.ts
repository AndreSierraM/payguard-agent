/**
 * Thin PayPal config loader. No API calls yet.
 *
 * Plan: hand this config to the official PayPal Agent Toolkit
 * (`@paypal/agent-toolkit`, see https://github.com/paypal/agent-toolkit)
 * or point an MCP client at the hosted PayPal MCP server
 * (sandbox: https://mcp.sandbox.paypal.com/sse ; production: https://mcp.paypal.com/sse). Do not hand-roll request shapes here —
 * follow the toolkit/MCP docs when wiring real calls.
 */

export type PayPalEnv = "sandbox" | "live";

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  env: PayPalEnv;
}

export class MissingPayPalCredentialsError extends Error {
  constructor(missing: string[]) {
    super(
      `Missing PayPal credentials: ${missing.join(", ")}. ` +
        "Copy .env.example to .env and fill in your SANDBOX Client ID/Secret " +
        "from https://developer.paypal.com/dashboard/applications/sandbox",
    );
    this.name = "MissingPayPalCredentialsError";
  }
}

export function loadPayPalConfig(env: NodeJS.ProcessEnv = process.env): PayPalConfig {
  const clientId = env.PAYPAL_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim() ?? "";
  const missing: string[] = [];
  if (!clientId) missing.push("PAYPAL_CLIENT_ID");
  if (!clientSecret) missing.push("PAYPAL_CLIENT_SECRET");
  if (missing.length) throw new MissingPayPalCredentialsError(missing);

  const rawEnv = (env.PAYPAL_ENV ?? "sandbox").trim().toLowerCase();
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    throw new Error(`PAYPAL_ENV must be "sandbox" or "live" (got "${rawEnv}")`);
  }
  return { clientId, clientSecret, env: rawEnv };
}
