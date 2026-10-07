import { DEFAULT_POLICY_CONFIG } from "./defaults.js";
import type {
  PolicyCheckResult,
  PolicyConfig,
  PolicyContext,
  PolicyDecision,
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

/**
 * Allow-list is a SOFT gate: unknown / empty list → status "confirm" (not hard fail).
 * Empty allow-list ≠ allow-all — nobody gets silent ALLOW.
 */
function checkAllowList(proposal: ProposedPayout, config: PolicyConfig): PolicyCheckResult {
  const list = config.allowList.map(normalizeRecipient).filter(Boolean);
  const recipient = normalizeRecipient(proposal.recipient);

  if (list.length === 0) {
    return {
      name: "allow_list",
      status: "confirm",
      message:
        "Allow-list is empty — recipient treated as untrusted; human confirmation required",
      details: { allowListSize: 0, recipient: proposal.recipient },
    };
  }

  if (!list.includes(recipient)) {
    return {
      name: "allow_list",
      status: "confirm",
      message: `Recipient "${proposal.recipient}" is not on the allow-list (new / untrusted payee)`,
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

function decide(checks: PolicyCheckResult[]): {
  decision: PolicyDecision;
  reasons: string[];
  violations: PolicyViolation[];
} {
  const hardFails = checks.filter((c) => c.status === "fail");
  const softConfirms = checks.filter((c) => c.status === "confirm");

  const violations: PolicyViolation[] = hardFails.map((c) => ({
    code: c.name,
    message: c.message,
    details: c.details,
  }));

  if (hardFails.length > 0) {
    return {
      decision: "BLOCK",
      reasons: hardFails.map((c) => c.message),
      violations,
    };
  }

  if (softConfirms.length > 0) {
    return {
      decision: "CONFIRM",
      reasons: softConfirms.map((c) => c.message),
      violations: [],
    };
  }

  return {
    decision: "ALLOW",
    reasons: ["All hard checks passed and recipient is on the allow-list"],
    violations: [],
  };
}

function blockedEvaluation(
  message: string,
  code: PolicyViolation["code"],
  details?: Record<string, unknown>,
): PolicyEvaluation {
  const check: PolicyCheckResult = {
    name: code,
    status: "fail",
    message,
    details,
  };
  return {
    decision: "BLOCK",
    reasons: [message],
    ruleHits: [check],
    allowed: false,
    violations: [{ code, message, details }],
    checks: [check],
  };
}

/**
 * Evaluate a proposed payout against the active policy config and recent history.
 * Does not mutate state; callers record payouts after human confirmation.
 *
 * Verdicts:
 * - BLOCK — hard fail (spend, velocity, duplicate, invalid input)
 * - CONFIRM — recipient not on allow-list (or allow-list empty) and no hard fail
 * - ALLOW — recipient on allow-list and all hard checks pass
 */
export function evaluatePolicies(
  proposal: ProposedPayout,
  context: Partial<PolicyContext> & { recentPayouts?: RecordedPayout[] } = {},
): PolicyEvaluation {
  const config: PolicyConfig = context.config ?? DEFAULT_POLICY_CONFIG;
  const recent = context.recentPayouts ?? [];
  const now = context.now ?? Date.now();

  if (!Number.isFinite(proposal.amount) || proposal.amount <= 0) {
    return blockedEvaluation("Amount must be a positive finite number", "spend_limit_per_tx", {
      amount: proposal.amount,
    });
  }

  if (!proposal.currency?.trim()) {
    return blockedEvaluation("Currency is required", "spend_limit_per_tx");
  }

  if (!proposal.recipient?.trim()) {
    return blockedEvaluation("Recipient is required", "allow_list");
  }

  const checks: PolicyCheckResult[] = [
    checkSpendLimitPerTx(proposal, config),
    checkSpendLimitDaily(proposal, config, recent, now),
    checkAllowList(proposal, config),
    checkVelocity(config, recent, now),
    checkDuplicate(proposal, config, recent, now),
  ];

  const { decision, reasons, violations } = decide(checks);

  return {
    decision,
    reasons,
    ruleHits: checks,
    allowed: decision !== "BLOCK",
    violations,
    checks,
  };
}

export { DEFAULT_POLICY_CONFIG };
