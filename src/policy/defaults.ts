import type { PolicyConfig } from "./types.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Default hackathon-friendly policy config.
 * Exported for GET /policies and as the evaluatePolicies default.
 */
export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  spendLimits: {
    perTransaction: 500,
    dailyLimit: 2000,
    windowMs: DAY_MS,
  },
  // Empty allow-list = allow any recipient (checks still run as pass/skip).
  // Populate with sandbox emails for demos, e.g. ["contractor@example.com"].
  allowList: [],
  velocity: {
    maxPayouts: 10,
    windowMs: HOUR_MS,
  },
  duplicate: {
    windowMs: HOUR_MS,
  },
};

export { HOUR_MS, DAY_MS };
