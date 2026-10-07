import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluatePolicies } from "./engine.js";
import { DEFAULT_POLICY_CONFIG, HOUR_MS } from "./defaults.js";
import { loadPolicyConfigFromEnv } from "./config.js";
import type { PolicyConfig, ProposedPayout, RecordedPayout } from "./types.js";

const baseProposal: ProposedPayout = {
  amount: 100,
  currency: "USD",
  recipient: "alice@example.com",
  memo: "October invoice",
};

function recorded(
  overrides: Partial<RecordedPayout> & Pick<RecordedPayout, "id" | "recordedAt">,
): RecordedPayout {
  return {
    amount: 50,
    currency: "USD",
    recipient: "alice@example.com",
    ...overrides,
  };
}

describe("evaluatePolicies", () => {
  it("ALLOW: Alice $50 on seed allow-list", () => {
    const result = evaluatePolicies(
      { amount: 50, currency: "USD", recipient: "alice@example.com" },
      { config: DEFAULT_POLICY_CONFIG, recentPayouts: [], now: 1_000_000 },
    );
    assert.equal(result.decision, "ALLOW");
    assert.equal(result.allowed, true);
    assert.equal(result.violations.length, 0);
    assert.ok(result.reasons.length > 0);
    assert.equal(result.ruleHits.length, result.checks.length);
    assert.equal(result.checks.find((c) => c.name === "allow_list")?.status, "pass");
  });

  it("BLOCK: Pay Bob $2500 exceeds per-tx limit", () => {
    const result = evaluatePolicies(
      { amount: 2500, currency: "USD", recipient: "bob@example.com" },
      { config: DEFAULT_POLICY_CONFIG, recentPayouts: [], now: 1_000_000 },
    );
    assert.equal(result.decision, "BLOCK");
    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((v) => v.code === "spend_limit_per_tx"));
    assert.ok(result.reasons.some((r) => /per-transaction/i.test(r)));
  });

  it("CONFIRM: Pay Charlie $90 — new payee not on seed list", () => {
    const result = evaluatePolicies(
      { amount: 90, currency: "USD", recipient: "charlie@example.com" },
      { config: DEFAULT_POLICY_CONFIG, recentPayouts: [], now: 1_000_000 },
    );
    assert.equal(result.decision, "CONFIRM");
    assert.equal(result.allowed, true);
    assert.equal(result.violations.length, 0);
    assert.equal(result.checks.find((c) => c.name === "allow_list")?.status, "confirm");
    assert.ok(result.reasons.some((r) => /not on the allow-list/i.test(r)));
  });

  it("empty allow-list ≠ allow-all — yields CONFIRM, not ALLOW", () => {
    const config: PolicyConfig = { ...DEFAULT_POLICY_CONFIG, allowList: [] };
    const result = evaluatePolicies(baseProposal, {
      config,
      recentPayouts: [],
      now: 1_000_000,
    });
    assert.equal(result.decision, "CONFIRM");
    assert.notEqual(result.decision, "ALLOW");
    assert.equal(result.checks.find((c) => c.name === "allow_list")?.status, "confirm");
    assert.ok(result.reasons.some((r) => /empty/i.test(r)));
  });

  it("fails when amount exceeds per-transaction spend limit", () => {
    const result = evaluatePolicies(
      { ...baseProposal, amount: 501 },
      { config: DEFAULT_POLICY_CONFIG, recentPayouts: [], now: 1_000_000 },
    );
    assert.equal(result.decision, "BLOCK");
    assert.ok(result.violations.some((v) => v.code === "spend_limit_per_tx"));
  });

  it("fails when projected daily/window spend exceeds limit", () => {
    const config: PolicyConfig = {
      ...DEFAULT_POLICY_CONFIG,
      spendLimits: { perTransaction: 1000, dailyLimit: 200, windowMs: HOUR_MS },
    };
    const recent: RecordedPayout[] = [
      recorded({ id: "r1", amount: 150, recordedAt: 1_000_000 - 1000 }),
    ];
    const result = evaluatePolicies(
      { ...baseProposal, amount: 100 },
      { config, recentPayouts: recent, now: 1_000_000 },
    );
    assert.equal(result.decision, "BLOCK");
    assert.ok(result.violations.some((v) => v.code === "spend_limit_daily"));
  });

  it("CONFIRM when recipient is not on a non-empty allow-list (no hard fail)", () => {
    const config: PolicyConfig = {
      ...DEFAULT_POLICY_CONFIG,
      allowList: ["bob@example.com", "carol@example.com"],
    };
    const result = evaluatePolicies(baseProposal, {
      config,
      recentPayouts: [],
      now: 1_000_000,
    });
    assert.equal(result.decision, "CONFIRM");
    assert.equal(result.violations.length, 0);
  });

  it("ALLOW when recipient is on the allow-list (case-insensitive)", () => {
    const config: PolicyConfig = {
      ...DEFAULT_POLICY_CONFIG,
      allowList: ["Alice@Example.com"],
    };
    const result = evaluatePolicies(baseProposal, {
      config,
      recentPayouts: [],
      now: 1_000_000,
    });
    assert.equal(result.decision, "ALLOW");
    assert.equal(result.checks.find((c) => c.name === "allow_list")?.status, "pass");
  });

  it("BLOCK on velocity when max payouts in window would be exceeded", () => {
    const config: PolicyConfig = {
      ...DEFAULT_POLICY_CONFIG,
      velocity: { maxPayouts: 2, windowMs: HOUR_MS },
    };
    const now = 1_000_000;
    const recent: RecordedPayout[] = [
      recorded({ id: "r1", recordedAt: now - 1000 }),
      recorded({ id: "r2", recordedAt: now - 2000 }),
    ];
    const result = evaluatePolicies(baseProposal, {
      config,
      recentPayouts: recent,
      now,
    });
    assert.equal(result.decision, "BLOCK");
    assert.ok(result.violations.some((v) => v.code === "velocity"));
  });

  it("BLOCK on duplicate detection for same recipient+amount+memo in window", () => {
    const now = 1_000_000;
    const recent: RecordedPayout[] = [
      recorded({
        id: "r1",
        amount: 100,
        recipient: "alice@example.com",
        memo: "October invoice",
        recordedAt: now - 5000,
      }),
    ];
    const result = evaluatePolicies(baseProposal, {
      config: DEFAULT_POLICY_CONFIG,
      recentPayouts: recent,
      now,
    });
    assert.equal(result.decision, "BLOCK");
    assert.ok(result.violations.some((v) => v.code === "duplicate"));
  });

  it("BLOCK on duplicate when idempotencyKey matches", () => {
    const now = 1_000_000;
    const recent: RecordedPayout[] = [
      recorded({
        id: "r1",
        amount: 1,
        recipient: "other@example.com",
        idempotencyKey: "inv-42",
        recordedAt: now - 1000,
      }),
    ];
    const result = evaluatePolicies(
      { ...baseProposal, idempotencyKey: "inv-42" },
      { config: DEFAULT_POLICY_CONFIG, recentPayouts: recent, now },
    );
    assert.equal(result.decision, "BLOCK");
    assert.ok(result.violations.some((v) => v.code === "duplicate"));
  });

  it("ignores history outside the duplicate window", () => {
    const now = 1_000_000;
    const recent: RecordedPayout[] = [
      recorded({
        id: "r1",
        amount: 100,
        recipient: "alice@example.com",
        memo: "October invoice",
        recordedAt: now - HOUR_MS - 1,
      }),
    ];
    const result = evaluatePolicies(baseProposal, {
      config: DEFAULT_POLICY_CONFIG,
      recentPayouts: recent,
      now,
    });
    assert.equal(result.decision, "ALLOW");
  });

  it("BLOCK non-positive amount", () => {
    const result = evaluatePolicies(
      { ...baseProposal, amount: 0 },
      { config: DEFAULT_POLICY_CONFIG, recentPayouts: [] },
    );
    assert.equal(result.decision, "BLOCK");
  });

  it("hard fail wins over allow-list CONFIRM (Charlie $2500 → BLOCK)", () => {
    const result = evaluatePolicies(
      { amount: 2500, currency: "USD", recipient: "charlie@example.com" },
      { config: DEFAULT_POLICY_CONFIG, recentPayouts: [], now: 1_000_000 },
    );
    assert.equal(result.decision, "BLOCK");
    assert.ok(result.reasons.some((r) => /per-transaction/i.test(r)));
  });
});

describe("loadPolicyConfigFromEnv", () => {
  it("seeds Alice/Bob/Dana when PAYGUARD_ALLOW_LIST unset", () => {
    const cfg = loadPolicyConfigFromEnv({});
    assert.deepEqual(cfg.allowList, [
      "alice@example.com",
      "bob@example.com",
      "dana@example.com",
    ]);
    assert.equal(cfg.spendLimits.perTransaction, 500);
    assert.equal(cfg.spendLimits.dailyLimit, 2000);
  });

  it("empty PAYGUARD_ALLOW_LIST yields empty list (not seed, not allow-all)", () => {
    const cfg = loadPolicyConfigFromEnv({ PAYGUARD_ALLOW_LIST: "" });
    assert.deepEqual(cfg.allowList, []);
  });

  it("honors numeric cap overrides", () => {
    const cfg = loadPolicyConfigFromEnv({
      PAYGUARD_PER_TX_LIMIT: "100",
      PAYGUARD_DAILY_LIMIT: "300",
      PAYGUARD_ALLOW_LIST: "x@y.com, z@y.com",
    });
    assert.equal(cfg.spendLimits.perTransaction, 100);
    assert.equal(cfg.spendLimits.dailyLimit, 300);
    assert.deepEqual(cfg.allowList, ["x@y.com", "z@y.com"]);
  });
});
