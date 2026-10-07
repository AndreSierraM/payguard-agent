import type { PolicyConfig } from "./types.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Seed trusted payees for the hackathon demo. Charlie is intentionally absent (CONFIRM theater). */
export const DEFAULT_ALLOW_LIST_SEED = [
  "alice@example.com",
  "bob@example.com",
  "dana@example.com",
] as const;

/**
 * Static default policy config (tests + GET /policies fallback).
 * Runtime boots should prefer `loadPolicyConfigFromEnv()`.
 */
export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  spendLimits: {
    perTransaction: 500,
    dailyLimit: 2000,
    windowMs: DAY_MS,
  },
  allowList: [...DEFAULT_ALLOW_LIST_SEED],
  velocity: {
    maxPayouts: 10,
    windowMs: HOUR_MS,
  },
  duplicate: {
    windowMs: HOUR_MS,
  },
};

export { HOUR_MS, DAY_MS };
