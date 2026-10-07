import express, { type Express, type Request, type Response } from "express";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_POLICY_CONFIG,
  evaluatePolicies,
  InMemoryPayoutHistoryStore,
  type PolicyConfig,
  type PayoutHistoryStore,
  type ProposedPayout,
  type RecordedPayout,
} from "../policy/index.js";
import type { PayoutExecutor, RuntimeMode } from "../paypal/executor.js";
import { InMemoryProposalStore, type ProposalStore } from "./proposals.js";
import { requireApiKey, resolveApiKey, DEFAULT_DEMO_API_KEY } from "./auth.js";
import { AuditLog } from "../audit/log.js";
import { parseIntent } from "../intent/parse.js";

export interface AppDeps {
  mode: RuntimeMode;
  executor: PayoutExecutor;
  policyConfig?: PolicyConfig;
  historyStore?: PayoutHistoryStore;
  proposalStore?: ProposalStore;
  auditLog?: AuditLog;
  apiKey?: string;
  /** When false, skip mounting static public/ (tests). Default true. */
  serveStatic?: boolean;
}

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  const policyConfig = deps.policyConfig ?? DEFAULT_POLICY_CONFIG;
  const history = deps.historyStore ?? new InMemoryPayoutHistoryStore();
  const proposals = deps.proposalStore ?? new InMemoryProposalStore();
  const audit = deps.auditLog ?? new AuditLog({ enableFile: false });
  const apiKey = deps.apiKey ?? resolveApiKey();
  const keyed = requireApiKey(apiKey);

  if (deps.serveStatic !== false) {
    const publicDir = resolve(__dirname, "../../public");
    app.use(express.static(publicDir));
    app.get("/", (_req: Request, res: Response) => {
      res.sendFile(resolve(publicDir, "index.html"));
    });
  }

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: "payguard-agent",
      mode: deps.mode,
      apiKeyRequired: true,
      demoApiKeyHint: apiKey === DEFAULT_DEMO_API_KEY ? DEFAULT_DEMO_API_KEY : "(custom PAYGUARD_API_KEY)",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/policies", (_req: Request, res: Response) => {
    res.json({
      config: policyConfig,
      note:
        "Caps and allow-list from env (PAYGUARD_PER_TX_LIMIT, PAYGUARD_DAILY_LIMIT, " +
        "PAYGUARD_ALLOW_LIST). Empty allow-list ≠ allow-all — unknown payees → CONFIRM.",
    });
  });

  app.get("/audit", keyed, (_req: Request, res: Response) => {
    res.json({ events: audit.list() });
  });

  app.post("/payouts/propose", keyed, (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Partial<ProposedPayout> & { intent?: string };

    let amount: number;
    let currency: string;
    let recipient: string;
    let memo: string | undefined;
    let reference: string | undefined;
    let idempotencyKey: string | undefined;

    if (typeof body.intent === "string" && body.intent.trim()) {
      const parsed = parseIntent(body.intent);
      if (!parsed) {
        res.status(400).json({
          status: "rejected",
          error:
            'Could not parse intent. Try e.g. "Pay Bob $2500" or send amount/currency/recipient fields.',
        });
        return;
      }
      amount = parsed.amount;
      currency = parsed.currency;
      recipient = parsed.recipient;
      memo = typeof body.memo === "string" ? body.memo : parsed.memo;
      reference = typeof body.reference === "string" ? body.reference : undefined;
      idempotencyKey =
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined;
    } else {
      amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
      currency = typeof body.currency === "string" ? body.currency : "";
      recipient = typeof body.recipient === "string" ? body.recipient : "";
      memo = typeof body.memo === "string" ? body.memo : undefined;
      reference = typeof body.reference === "string" ? body.reference : undefined;
      idempotencyKey =
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined;
    }

    const payout: ProposedPayout = {
      amount,
      currency,
      recipient,
      memo,
      reference,
      idempotencyKey,
    };

    if (!Number.isFinite(payout.amount) || payout.amount <= 0) {
      res.status(400).json({
        status: "rejected",
        error: "amount must be a positive number",
      });
      return;
    }
    if (!payout.currency.trim() || !payout.recipient.trim()) {
      res.status(400).json({
        status: "rejected",
        error: "currency and recipient are required",
      });
      return;
    }

    const policy = evaluatePolicies(payout, {
      config: policyConfig,
      recentPayouts: history.list(),
    });

    // Always HTTP 200 with decision so the UI can render ALLOW | BLOCK | CONFIRM consistently.
    // HTTP 400 is reserved for malformed bodies (above).
    if (policy.decision === "BLOCK") {
      audit.append("block", {
        decision: policy.decision,
        amount: payout.amount,
        currency: payout.currency,
        recipient: payout.recipient,
        reasons: policy.reasons,
        details: { checks: policy.checks },
      });
      res.status(200).json({
        status: "blocked",
        decision: policy.decision,
        reasons: policy.reasons,
        ruleHits: policy.ruleHits,
        checks: policy.checks,
        violations: policy.violations,
        proposal: payout,
      });
      return;
    }

    const stored = proposals.create(payout, policy);
    audit.append("propose", {
      decision: policy.decision,
      proposalId: stored.id,
      amount: payout.amount,
      currency: payout.currency,
      recipient: payout.recipient,
      reasons: policy.reasons,
    });

    res.status(200).json({
      status: "pending_confirmation",
      decision: policy.decision,
      reasons: policy.reasons,
      ruleHits: policy.ruleHits,
      checks: policy.checks,
      violations: policy.violations,
      proposal: stored.payout,
      proposalId: stored.id,
      policy: stored.policy,
    });
  });

  app.post("/payouts/confirm", keyed, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { proposalId?: string };
    const proposalId = typeof body.proposalId === "string" ? body.proposalId.trim() : "";
    if (!proposalId) {
      res.status(400).json({ error: "proposalId is required" });
      return;
    }

    const existing = proposals.get(proposalId);
    if (!existing) {
      res.status(404).json({ error: `Unknown proposalId: ${proposalId}` });
      return;
    }
    if (existing.status === "confirmed") {
      res.status(409).json({
        error: "Proposal already confirmed",
        proposalId,
        status: existing.status,
      });
      return;
    }
    if (existing.status === "cancelled") {
      res.status(409).json({
        error: "Proposal was cancelled",
        proposalId,
        status: existing.status,
      });
      return;
    }
    if (existing.policy.decision === "BLOCK") {
      res.status(409).json({
        error: "Blocked proposals cannot be confirmed",
        proposalId,
        decision: existing.policy.decision,
      });
      return;
    }

    const payout = { ...existing.payout, id: existing.id };
    try {
      const result = await deps.executor.executeConfirmed(payout);
      proposals.markConfirmed(proposalId);

      const recorded: RecordedPayout = {
        id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        recipient: payout.recipient,
        memo: payout.memo,
        reference: payout.reference,
        idempotencyKey: payout.idempotencyKey,
        recordedAt: Date.now(),
      };
      history.add(recorded);

      audit.append("confirm", {
        decision: existing.policy.decision,
        proposalId,
        payoutId: result.payoutId,
        amount: payout.amount,
        currency: payout.currency,
        recipient: payout.recipient,
        details: { mode: result.mode },
      });

      res.status(200).json({
        status: "confirmed",
        proposalId,
        payoutId: result.payoutId,
        result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[payguard] confirm failed:", message);
      res.status(500).json({
        status: "error",
        proposalId,
        error: message,
      });
    }
  });

  app.post("/payouts/cancel", keyed, (req: Request, res: Response) => {
    const body = (req.body ?? {}) as { proposalId?: string };
    const proposalId = typeof body.proposalId === "string" ? body.proposalId.trim() : "";
    if (!proposalId) {
      res.status(400).json({ error: "proposalId is required" });
      return;
    }
    const existing = proposals.get(proposalId);
    if (!existing) {
      res.status(404).json({ error: `Unknown proposalId: ${proposalId}` });
      return;
    }
    if (existing.status !== "pending_confirmation") {
      res.status(409).json({
        error: `Cannot cancel proposal in status ${existing.status}`,
        proposalId,
        status: existing.status,
      });
      return;
    }
    proposals.markCancelled(proposalId);
    audit.append("cancel", {
      proposalId,
      amount: existing.payout.amount,
      currency: existing.payout.currency,
      recipient: existing.payout.recipient,
      decision: existing.policy.decision,
    });
    res.status(200).json({ status: "cancelled", proposalId });
  });

  return app;
}

export function startServer(
  deps: AppDeps,
  port: number = Number(process.env.PORT) || 3000,
): ReturnType<Express["listen"]> {
  const app = createApp(deps);
  return app.listen(port, () => {
    console.log(`[payguard] HTTP listening on port ${port} (mode=${deps.mode})`);
    console.log(`[payguard] Demo UI: http://localhost:${port}/`);
    console.log(
      `[payguard] Judges: send header X-API-Key: ${deps.apiKey ?? resolveApiKey()}`,
    );
  });
}
