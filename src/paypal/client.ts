/**
 * Thin PayPal config loader.
 *
 * Prefer `createPayoutExecutor()` from `./executor.js` at startup: missing
 * credentials become dry-run mode (warn) instead of a fatal throw, so the
 * HTTP demo always boots. `loadPayPalConfig` remains for callers that need
 * a hard failure when creds are required.
 *
 * Hand the config to `@paypal/agent-toolkit` or point an MCP client at
 * sandbox: https://mcp.sandbox.paypal.com/sse (NOT production mcp.paypal.com).
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

/**
 * Strict loader — throws if credentials are missing.
 * Use createPayoutExecutor() when dry-run fallback is preferred.
 */
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

/**
 * Soft probe: returns config if both creds exist and env is sandbox|live,
 * otherwise null (caller should dry-run).
 */
export function tryLoadPayPalConfig(
  env: NodeJS.ProcessEnv = process.env,
): PayPalConfig | null {
  try {
    return loadPayPalConfig(env);
  } catch (err) {
    if (err instanceof MissingPayPalCredentialsError) return null;
    throw err;
  }
}
