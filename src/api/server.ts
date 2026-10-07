import express, { type Express, type Request, type Response } from "express";
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

export interface AppDeps {
  mode: RuntimeMode;
  executor: PayoutExecutor;
  policyConfig?: PolicyConfig;
  historyStore?: PayoutHistoryStore;
  proposalStore?: ProposalStore;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json());

  const policyConfig = deps.policyConfig ?? DEFAULT_POLICY_CONFIG;
  const history = deps.historyStore ?? new InMemoryPayoutHistoryStore();
  const proposals = deps.proposalStore ?? new InMemoryProposalStore();

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: "payguard-agent",
      mode: deps.mode,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/policies", (_req: Request, res: Response) => {
    res.json({
      config: policyConfig,
      note: "In-memory default config for the hackathon demo. Customize via code or future admin API.",
    });
  });

  app.post("/payouts/propose", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Partial<ProposedPayout>;
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
    const payout: ProposedPayout = {
      amount,
      currency: typeof body.currency === "string" ? body.currency : "",
      recipient: typeof body.recipient === "string" ? body.recipient : "",
      memo: typeof body.memo === "string" ? body.memo : undefined,
      reference: typeof body.reference === "string" ? body.reference : undefined,
      idempotencyKey:
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
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

    if (!policy.allowed) {
      res.status(400).json({
        status: "rejected",
        violations: policy.violations,
        checks: policy.checks,
      });
      return;
    }

    const stored = proposals.create(payout, policy);
    res.status(200).json({
      status: "pending_confirmation",
      proposal: stored.payout,
      proposalId: stored.id,
      policy: stored.policy,
    });
  });

  app.post("/payouts/confirm", async (req: Request, res: Response) => {
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

      res.status(200).json({
        status: "confirmed",
        proposalId,
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

  return app;
}

export function startServer(
  deps: AppDeps,
  port: number = Number(process.env.PORT) || 3000,
): ReturnType<Express["listen"]> {
  const app = createApp(deps);
  return app.listen(port, () => {
    console.log(`[payguard] HTTP listening on port ${port} (mode=${deps.mode})`);
  });
}
