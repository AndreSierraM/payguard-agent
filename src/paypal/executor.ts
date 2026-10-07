import type { ProposedPayout } from "../policy/types.js";
import type { PayPalConfig } from "./client.js";
import { PAYPAL_MCP_SANDBOX_HTTP, PAYPAL_MCP_SANDBOX_SSE } from "./mcp.js";

export type ExecutorMode = "dry-run" | "sandbox";

export interface ExecuteResult {
  mode: ExecutorMode;
  ok: boolean;
  proposalId: string;
  message: string;
  /** Toolkit / provider payload when sandbox path is wired; opaque for dry-run */
  details?: Record<string, unknown>;
}

/**
 * Abstraction over payout execution so the HTTP layer never talks to PayPal
 * directly. Dry-run is the default when credentials are missing.
 */
export interface PayoutExecutor {
  readonly mode: ExecutorMode;
  executeConfirmed(payout: ProposedPayout & { id: string }): Promise<ExecuteResult>;
}

export class DryRunExecutor implements PayoutExecutor {
  readonly mode: ExecutorMode = "dry-run";

  async executeConfirmed(payout: ProposedPayout & { id: string }): Promise<ExecuteResult> {
    const summary = {
      id: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      recipient: payout.recipient,
      memo: payout.memo,
      reference: payout.reference,
      idempotencyKey: payout.idempotencyKey,
    };
    console.log("[payguard:dry-run] would execute payout:", JSON.stringify(summary));
    return {
      mode: "dry-run",
      ok: true,
      proposalId: payout.id,
      message:
        "Dry-run: payout logged only. Set PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET " +
        "(PAYPAL_ENV=sandbox) to enable the PayPal Agent Toolkit sandbox path.",
      details: {
        proposed: summary,
        mcpSandboxSse: PAYPAL_MCP_SANDBOX_SSE,
        mcpSandboxHttp: PAYPAL_MCP_SANDBOX_HTTP,
      },
    };
  }
}

/**
 * Sandbox executor: prepares the PayPal Agent Toolkit path.
 * Lazy-imports `@paypal/agent-toolkit/ai-sdk` so tests / dry-run never load it.
 * Does not call live/prod APIs. Live env is refused at factory time.
 */
export class SandboxToolkitExecutor implements PayoutExecutor {
  readonly mode: ExecutorMode = "sandbox";
  private readonly config: PayPalConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toolkit: any | null = null;

  constructor(config: PayPalConfig) {
    if (config.env !== "sandbox") {
      throw new Error(
        `SandboxToolkitExecutor refuses PAYPAL_ENV="${config.env}". Hackathon is sandbox-only.`,
      );
    }
    this.config = config;
  }

  private async getToolkit(): Promise<unknown> {
    if (this.toolkit) return this.toolkit;
    // Lazy import — avoid constructing network clients in dry-run / unit tests.
    const mod = await import("@paypal/agent-toolkit/ai-sdk");
    const { PayPalAgentToolkit } = mod as {
      PayPalAgentToolkit: new (opts: {
        clientId: string;
        clientSecret: string;
        configuration?: { actions?: Record<string, unknown> };
      }) => unknown;
    };
    this.toolkit = new PayPalAgentToolkit({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      configuration: {
        actions: {
          // Enable payout-related actions when wiring a real sandbox demo.
          // Keep the surface narrow until NL + confirm flow is proven.
        },
      },
    });
    return this.toolkit;
  }

  async executeConfirmed(payout: ProposedPayout & { id: string }): Promise<ExecuteResult> {
    // Ensure toolkit can be constructed; actual payout tool invocation is
    // left as the next integration step once sandbox creds are available.
    const toolkit = await this.getToolkit();
    console.log(
      "[payguard:sandbox] toolkit ready; payout confirm stub — wire tool call next:",
      payout.id,
    );
    return {
      mode: "sandbox",
      ok: true,
      proposalId: payout.id,
      message:
        "Sandbox toolkit constructed. Payout tool invocation is prepared but not " +
        "fired automatically — map confirmed proposals to toolkit payout actions next.",
      details: {
        toolkitReady: Boolean(toolkit),
        proposed: {
          id: payout.id,
          amount: payout.amount,
          currency: payout.currency,
          recipient: payout.recipient,
          memo: payout.memo,
          reference: payout.reference,
        },
        mcpSandboxSse: PAYPAL_MCP_SANDBOX_SSE,
        mcpSandboxHttp: PAYPAL_MCP_SANDBOX_HTTP,
      },
    };
  }
}

export type RuntimeMode = ExecutorMode;

export interface CreateExecutorResult {
  executor: PayoutExecutor;
  mode: RuntimeMode;
  warning?: string;
}

/**
 * Build the executor used by the HTTP API.
 * Missing creds → DryRunExecutor (warn, do not throw).
 * PAYPAL_ENV=live → force dry-run (sandbox only for hackathon).
 * Creds + sandbox → SandboxToolkitExecutor (lazy toolkit).
 */
export function createPayoutExecutor(
  env: NodeJS.ProcessEnv = process.env,
): CreateExecutorResult {
  const clientId = env.PAYPAL_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim() ?? "";
  const rawEnv = (env.PAYPAL_ENV ?? "sandbox").trim().toLowerCase();

  if (!clientId || !clientSecret) {
    const missing = [
      !clientId ? "PAYPAL_CLIENT_ID" : null,
      !clientSecret ? "PAYPAL_CLIENT_SECRET" : null,
    ].filter(Boolean);
    const warning =
      `Missing PayPal credentials (${missing.join(", ")}). ` +
      "Running in dry-run mode — no PayPal API calls. Copy .env.example to .env " +
      "and paste SANDBOX Client ID/Secret from " +
      "https://developer.paypal.com/dashboard/applications/sandbox when ready.";
    return { executor: new DryRunExecutor(), mode: "dry-run", warning };
  }

  if (rawEnv === "live") {
    const warning =
      'PAYPAL_ENV=live is refused for this hackathon build. Forcing dry-run. ' +
      'Set PAYPAL_ENV=sandbox to use the PayPal Agent Toolkit sandbox path.';
    return { executor: new DryRunExecutor(), mode: "dry-run", warning };
  }

  if (rawEnv !== "sandbox") {
    const warning = `PAYPAL_ENV must be "sandbox" (got "${rawEnv}"). Forcing dry-run.`;
    return { executor: new DryRunExecutor(), mode: "dry-run", warning };
  }

  return {
    executor: new SandboxToolkitExecutor({
      clientId,
      clientSecret,
      env: "sandbox",
    }),
    mode: "sandbox",
  };
}
