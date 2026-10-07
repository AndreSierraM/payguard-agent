import { DEFAULT_POLICY_CONFIG } from "./defaults.js";
import type {
  PolicyCheckResult,
  PolicyConfig,
  PolicyContext,
  PolicyEvaluation,
  PolicyViolation,
  ProposedPayout,
  RecordedPayout,
} from "./types.js";

function normalizeRecipient(recipient: string): string {
  return recipient.trim().toLowerCase();
}

function inWindow(payout: RecordedPayout, now: number, windowMs: number): boolean {
  return now - payout.recordedAt <= windowMs && now - payout.recordedAt >= 0;
}

function checkSpendLimitPerTx(
  proposal: ProposedPayout,
  config: PolicyConfig,
): PolicyCheckResult {
  const limit = config.spendLimits.perTransaction;
  if (proposal.amount > limit) {
    return {
      name: "spend_limit_per_tx",
      status: "fail",
      message: `Amount ${proposal.amount} ${proposal.currency} exceeds per-transaction limit of ${limit}`,
      details: { amount: proposal.amount, limit },
    };
  }
  return {
    name: "spend_limit_per_tx",
    status: "pass",
    message: `Amount ${proposal.amount} within per-transaction limit ${limit}`,
    details: { amount: proposal.amount, limit },
  };
}

function checkSpendLimitDaily(
  proposal: ProposedPayout,
  config: PolicyConfig,
  recent: RecordedPayout[],
  now: number,
): PolicyCheckResult {
  const { dailyLimit, windowMs } = config.spendLimits;
  const currency = proposal.currency.toUpperCase();
  const spentInWindow = recent
    .filter((p) => inWindow(p, now, windowMs) && p.currency.toUpperCase() === currency)
    .reduce((sum, p) => sum + p.amount, 0);
  const projected = spentInWindow + proposal.amount;

  if (projected > dailyLimit) {
    return {
      name: "spend_limit_daily",
      status: "fail",
      message: `Projected window spend ${projected} ${currency} exceeds limit ${dailyLimit}`,
      details: { spentInWindow, amount: proposal.amount, projected, dailyLimit, windowMs },
    };
  }
  return {
    name: "spend_limit_daily",
    status: "pass",
    message: `Projected window spend ${projected} ${currency} within limit ${dailyLimit}`,
    details: { spentInWindow, amount: proposal.amount, projected, dailyLimit, windowMs },
  };
}

function checkAllowList(proposal: ProposedPayout, config: PolicyConfig): PolicyCheckResult {
  const list = config.allowList.map(normalizeRecipient).filter(Boolean);
  if (list.length === 0) {
    return {
      name: "allow_list",
      status: "skip",
      message: "Allow-list is empty; all recipients permitted",
      details: { allowListSize: 0 },
    };
  }
  const recipient = normalizeRecipient(proposal.recipient);
  if (!list.includes(recipient)) {
    return {
      name: "allow_list",
      status: "fail",
      message: `Recipient "${proposal.recipient}" is not on the allow-list`,
      details: { recipient: proposal.recipient, allowListSize: list.length },
    };
  }
  return {
    name: "allow_list",
    status: "pass",
    message: `Recipient "${proposal.recipient}" is on the allow-list`,
    details: { recipient: proposal.recipient },
  };
}

function checkVelocity(
  config: PolicyConfig,
  recent: RecordedPayout[],
  now: number,
): PolicyCheckResult {
  const { maxPayouts, windowMs } = config.velocity;
  const count = recent.filter((p) => inWindow(p, now, windowMs)).length;
  // Proposed payout would be count + 1
  if (count + 1 > maxPayouts) {
    return {
      name: "velocity",
      status: "fail",
      message: `Velocity limit exceeded: ${count} payouts in window (max ${maxPayouts})`,
      details: { count, maxPayouts, windowMs, projected: count + 1 },
    };
  }
  return {
    name: "velocity",
    status: "pass",
    message: `Velocity ok: ${count + 1}/${maxPayouts} payouts in window`,
    details: { count, maxPayouts, windowMs, projected: count + 1 },
  };
}

function duplicateSignature(p: {
  recipient: string;
  amount: number;
  memo?: string;
  idempotencyKey?: string;
}): string {
  if (p.idempotencyKey?.trim()) {
    return `key:${p.idempotencyKey.trim()}`;
  }
  const memo = (p.memo ?? "").trim().toLowerCase();
  return `ra:${normalizeRecipient(p.recipient)}|${p.amount}|${memo}`;
}

function checkDuplicate(
  proposal: ProposedPayout,
  config: PolicyConfig,
  recent: RecordedPayout[],
  now: number,
): PolicyCheckResult {
  const { windowMs } = config.duplicate;
  const sig = duplicateSignature(proposal);
  const match = recent.find(
    (p) => inWindow(p, now, windowMs) && duplicateSignature(p) === sig,
  );
  if (match) {
    return {
      name: "duplicate",
      status: "fail",
      message: `Duplicate payout detected within window (matches id=${match.id})`,
      details: { matchedId: match.id, signature: sig, windowMs },
    };
  }
  return {
    name: "duplicate",
    status: "pass",
    message: "No duplicate payout found in window",
    details: { signature: sig, windowMs },
  };
}

/**
 * Evaluate a proposed payout against the active policy config and recent history.
 * Does not mutate state; callers record payouts after human confirmation.
 */
export function evaluatePolicies(
  proposal: ProposedPayout,
  context: Partial<PolicyContext> & { recentPayouts?: RecordedPayout[] } = {},
): PolicyEvaluation {
  const config: PolicyConfig = context.config ?? DEFAULT_POLICY_CONFIG;
  const recent = context.recentPayouts ?? [];
  const now = context.now ?? Date.now();

  if (!Number.isFinite(proposal.amount) || proposal.amount <= 0) {
    const violation: PolicyViolation = {
      code: "spend_limit_per_tx",
      message: "Amount must be a positive finite number",
      details: { amount: proposal.amount },
    };
    return {
      allowed: false,
      violations: [violation],
      checks: [
        {
          name: "spend_limit_per_tx",
          status: "fail",
          message: violation.message,
          details: violation.details,
        },
      ],
    };
  }

  if (!proposal.currency?.trim()) {
    return {
      allowed: false,
      violations: [
        {
          code: "spend_limit_per_tx",
          message: "Currency is required",
        },
      ],
      checks: [],
    };
  }

  if (!proposal.recipient?.trim()) {
    return {
      allowed: false,
      violations: [
        {
          code: "allow_list",
          message: "Recipient is required",
        },
      ],
      checks: [],
    };
  }

  const checks: PolicyCheckResult[] = [
    checkSpendLimitPerTx(proposal, config),
    checkSpendLimitDaily(proposal, config, recent, now),
    checkAllowList(proposal, config),
    checkVelocity(config, recent, now),
    checkDuplicate(proposal, config, recent, now),
  ];

  const violations: PolicyViolation[] = checks
    .filter((c) => c.status === "fail")
    .map((c) => ({
      code: c.name,
      message: c.message,
      details: c.details,
    }));

  return {
    allowed: violations.length === 0,
    violations,
    checks,
  };
}

export { DEFAULT_POLICY_CONFIG };
