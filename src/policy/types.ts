/**
 * Shared types for PayGuard payout proposals and policy evaluation.
 */

export interface ProposedPayout {
  /** Optional client-supplied or server-assigned id */
  id?: string;
  /** Amount in major currency units (e.g. 12.50 USD) */
  amount: number;
  /** ISO 4217 currency code, e.g. "USD" */
  currency: string;
  /** Recipient email or PayPal payer/merchant id */
  recipient: string;
  /** Optional memo / note on the payout */
  memo?: string;
  /** Optional external reference (invoice #, etc.) */
  reference?: string;
  /** Optional idempotency key for duplicate detection */
  idempotencyKey?: string;
}

export type PolicyCheckName =
  | "spend_limit_per_tx"
  | "spend_limit_daily"
  | "allow_list"
  | "velocity"
  | "duplicate";

/** pass = hard ok; fail = hard block; confirm = soft gate (human must approve); skip = unused */
export type PolicyCheckStatus = "pass" | "fail" | "confirm" | "skip";

export interface PolicyCheckResult {
  name: PolicyCheckName;
  status: PolicyCheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface PolicyViolation {
  code: PolicyCheckName;
  message: string;
  details?: Record<string, unknown>;
}

/** Final policy verdict shown to humans / UI. */
export type PolicyDecision = "ALLOW" | "BLOCK" | "CONFIRM";

export interface PolicyEvaluation {
  /** ALLOW | BLOCK | CONFIRM */
  decision: PolicyDecision;
  /** Human-readable reasons for the decision (demo / UI copy). */
  reasons: string[];
  /** Alias of checks for API clients that prefer ruleHits naming. */
  ruleHits: PolicyCheckResult[];
  /** @deprecated Prefer decision !== "BLOCK". Kept for callers that used allowed:boolean. */
  allowed: boolean;
  violations: PolicyViolation[];
  checks: PolicyCheckResult[];
}

/** A confirmed/executed payout recorded for velocity + duplicate windows. */
export interface RecordedPayout {
  id: string;
  amount: number;
  currency: string;
  recipient: string;
  memo?: string;
  reference?: string;
  idempotencyKey?: string;
  /** Epoch ms when the payout was recorded */
  recordedAt: number;
}

export interface SpendLimitConfig {
  /** Max amount per single transaction (major units) */
  perTransaction: number;
  /** Max total amount in the rolling window (major units) */
  dailyLimit: number;
  /** Window length in ms for the daily/window spend check (default 24h) */
  windowMs: number;
}

export interface VelocityConfig {
  /** Max number of payouts allowed in the window */
  maxPayouts: number;
  /** Window length in ms */
  windowMs: number;
}

export interface DuplicateConfig {
  /** Window length in ms for duplicate detection */
  windowMs: number;
}

export interface PolicyConfig {
  spendLimits: SpendLimitConfig;
  /**
   * Trusted recipients (case-insensitive email/id).
   * CRITICAL: empty allow-list ≠ allow-all. Unknown / empty → CONFIRM (soft), never silent pass.
   */
  allowList: string[];
  velocity: VelocityConfig;
  duplicate: DuplicateConfig;
}

export interface PolicyContext {
  /** Clock for deterministic tests; defaults to Date.now() */
  now?: number;
  /** Recent payouts used for velocity / spend / duplicate checks */
  recentPayouts: RecordedPayout[];
  /** Active policy config */
  config: PolicyConfig;
}
