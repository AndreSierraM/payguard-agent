import { createPayoutExecutor } from "./paypal/executor.js";
import { startServer } from "./api/server.js";
import { loadPolicyConfigFromEnv } from "./policy/config.js";
import { resolveApiKey } from "./api/auth.js";
import { AuditLog } from "./audit/log.js";

/**
 * PayGuard Agent — entry point.
 *
 * Boot path:
 *  1. Load .env if present (Render injects env vars from the dashboard).
 *  2. loadPolicyConfigFromEnv() — seed allow-list + caps from PAYGUARD_*.
 *  3. createPayoutExecutor() → dry-run when PAYPAL_* missing; sandbox toolkit
 *     when sandbox creds exist. Live env is refused (forced dry-run).
 *  4. Start Express on PORT (default 3000) with policy-gated propose/confirm + UI.
 *
 * MCP sandbox (do not use prod): https://mcp.sandbox.paypal.com/sse
 */
function loadDotEnv(): void {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* no .env — rely on process environment (e.g. Render) */
  }
}

function main(): void {
  loadDotEnv();
  console.log("[payguard] starting PayGuard Agent");

  const policyConfig = loadPolicyConfigFromEnv();
  console.log(
    `[payguard] policy: perTx=${policyConfig.spendLimits.perTransaction} ` +
      `daily=${policyConfig.spendLimits.dailyLimit} ` +
      `allowList=${policyConfig.allowList.length} ` +
      `(${policyConfig.allowList.join(", ") || "empty→CONFIRM"})`,
  );

  const { executor, mode, warning } = createPayoutExecutor();
  if (warning) {
    console.warn(`[payguard] ${warning}`);
  } else {
    console.log(`[payguard] executor mode=${mode}`);
  }

  const apiKey = resolveApiKey();
  const auditLog = new AuditLog();
  const port = Number(process.env.PORT) || 3000;
  startServer({ mode, executor, policyConfig, apiKey, auditLog }, port);
}

main();
