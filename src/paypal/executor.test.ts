import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createPayoutExecutor, DryRunExecutor } from "./executor.js";

describe("createPayoutExecutor", () => {
  it("returns dry-run when credentials are missing", () => {
    const { executor, mode, warning } = createPayoutExecutor({
      PAYPAL_ENV: "sandbox",
    });
    assert.equal(mode, "dry-run");
    assert.ok(executor instanceof DryRunExecutor);
    assert.ok(warning?.includes("PAYPAL_CLIENT_ID"));
  });

  it("forces dry-run when PAYPAL_ENV=live even with creds", () => {
    const { executor, mode, warning } = createPayoutExecutor({
      PAYPAL_CLIENT_ID: "id",
      PAYPAL_CLIENT_SECRET: "secret",
      PAYPAL_ENV: "live",
    });
    assert.equal(mode, "dry-run");
    assert.ok(executor instanceof DryRunExecutor);
    assert.ok(warning?.includes("live"));
  });

  it("selects sandbox mode when sandbox creds are present", () => {
    const { mode, warning } = createPayoutExecutor({
      PAYPAL_CLIENT_ID: "sandbox-id",
      PAYPAL_CLIENT_SECRET: "sandbox-secret",
      PAYPAL_ENV: "sandbox",
    });
    assert.equal(mode, "sandbox");
    assert.equal(warning, undefined);
  });

  it("DryRunExecutor returns stub PAYOUT-DRY-* payoutId", async () => {
    const exec = new DryRunExecutor();
    const result = await exec.executeConfirmed({
      id: "p-1",
      amount: 10,
      currency: "USD",
      recipient: "a@b.com",
    });
    assert.equal(result.mode, "dry-run");
    assert.equal(result.ok, true);
    assert.equal(result.proposalId, "p-1");
    assert.ok(result.payoutId?.startsWith("PAYOUT-DRY-"));
    assert.equal(result.details?.payoutId, result.payoutId);
  });
});
