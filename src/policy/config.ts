import {
  DEFAULT_ALLOW_LIST_SEED,
  DEFAULT_POLICY_CONFIG,
  DAY_MS,
  HOUR_MS,
} from "./defaults.js";
import type { PolicyConfig } from "./types.js";

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

/**
 * Load policy config from env at boot.
 *
 * - PAYGUARD_PER_TX_LIMIT (default 500)
 * - PAYGUARD_DAILY_LIMIT (default 2000)
 * - PAYGUARD_ALLOW_LIST — comma-separated override of the seed list.
 *   If the env var is present and empty after split → empty list (≠ allow-all).
 *   If unset → seed Alice/Bob/Dana.
 * - PAYGUARD_VELOCITY_MAX / PAYGUARD_VELOCITY_WINDOW_MS / PAYGUARD_DUPLICATE_WINDOW_MS optional
 */
export function loadPolicyConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): PolicyConfig {
  const perTransaction = parsePositiveNumber(
    env.PAYGUARD_PER_TX_LIMIT,
    DEFAULT_POLICY_CONFIG.spendLimits.perTransaction,
  );
  const dailyLimit = parsePositiveNumber(
    env.PAYGUARD_DAILY_LIMIT,
    DEFAULT_POLICY_CONFIG.spendLimits.dailyLimit,
  );

  let allowList: string[];
  if (Object.prototype.hasOwnProperty.call(env, "PAYGUARD_ALLOW_LIST")) {
    allowList = (env.PAYGUARD_ALLOW_LIST ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  } else {
    allowList = [...DEFAULT_ALLOW_LIST_SEED];
  }

  const maxPayouts = parsePositiveNumber(
    env.PAYGUARD_VELOCITY_MAX,
    DEFAULT_POLICY_CONFIG.velocity.maxPayouts,
  );
  const velocityWindowMs = parsePositiveNumber(
    env.PAYGUARD_VELOCITY_WINDOW_MS,
    HOUR_MS,
  );
  const duplicateWindowMs = parsePositiveNumber(
    env.PAYGUARD_DUPLICATE_WINDOW_MS,
    HOUR_MS,
  );

  return {
    spendLimits: {
      perTransaction,
      dailyLimit,
      windowMs: DAY_MS,
    },
    allowList,
    velocity: {
      maxPayouts,
      windowMs: velocityWindowMs,
    },
    duplicate: {
      windowMs: duplicateWindowMs,
    },
  };
}
