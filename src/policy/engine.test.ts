import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluatePolicies } from "./engine.js";
import { DEFAULT_POLICY_CONFIG, HOUR_MS } from "./defaults.js";
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
  it("passes a valid proposal with empty history and default config", () => {
    const result = evaluatePolicies(baseProposal, {
      config: DEFAULT_POLICY_CONFIG,
      recentPayouts: [],
      now: 1_000_000,
    });
    assert.equal(result.allowed, true);
    assert.equal(result.violations.length, 0);
    const names = result.checks.map((c) => c.name);
    assert.deepEqual(names, [
      "spend_limit_per_tx",
      "spend_limit_daily",
      "allow_list",
      "velocity",
      "duplicate",
    ]);
    assert.equal(result.checks.find((c) => c.name === "allow_list")?.status, "skip");
  });

  it("fails when amount exceeds per-transaction spend limit", () => {
    const result = evaluatePolicies(
      { ...baseProposal, amount: 501 },
      { config: DEFAULT_POLICY_CONFIG, recentPayouts: [], now: 1_000_000 },
    );
    assert.equal(result.allowed, false);
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
    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((v) => v.code === "spend_limit_daily"));
  });

  it("fails when recipient is not on a non-empty allow-list", () => {
    const config: PolicyConfig = {
      ...DEFAULT_POLICY_CONFIG,
      allowList: ["bob@example.com", "carol@example.com"],
    };
    const result = evaluatePolicies(baseProposal, {
      config,
      recentPayouts: [],
      now: 1_000_000,
    });
    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((v) => v.code === "allow_list"));
  });

  it("passes when recipient is on the allow-list (case-insensitive)", () => {
    const config: PolicyConfig = {
      ...DEFAULT_POLICY_CONFIG,
      allowList: ["Alice@Example.com"],
    };
    const result = evaluatePolicies(baseProposal, {
      config,
      recentPayouts: [],
      now: 1_000_000,
    });
    assert.equal(result.allowed, true);
    assert.equal(result.checks.find((c) => c.name === "allow_list")?.status, "pass");
  });

  it("fails velocity when max payouts in window would be exceeded", () => {
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
    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((v) => v.code === "velocity"));
  });

  it("fails duplicate detection for same recipient+amount+memo in window", () => {
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
    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((v) => v.code === "duplicate"));
  });

  it("fails duplicate detection when idempotencyKey matches", () => {
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
    assert.equal(result.allowed, false);
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
    assert.equal(result.allowed, true);
  });

  it("rejects non-positive amount", () => {
    const result = evaluatePolicies(
      { ...baseProposal, amount: 0 },
      { config: DEFAULT_POLICY_CONFIG, recentPayouts: [] },
    );
    assert.equal(result.allowed, false);
  });
});
