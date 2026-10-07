import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseIntent } from "./parse.js";

describe("parseIntent", () => {
  it("parses Pay Bob $2500", () => {
    const p = parseIntent("Pay Bob $2500");
    assert.ok(p);
    assert.equal(p!.amount, 2500);
    assert.equal(p!.recipient, "bob@example.com");
    assert.equal(p!.currency, "USD");
  });

  it("parses Pay Charlie $90", () => {
    const p = parseIntent("Pay Charlie $90");
    assert.ok(p);
    assert.equal(p!.amount, 90);
    assert.equal(p!.recipient, "charlie@example.com");
  });

  it("parses Pay Alice $50", () => {
    const p = parseIntent("Pay Alice $50");
    assert.ok(p);
    assert.equal(p!.amount, 50);
    assert.equal(p!.recipient, "alice@example.com");
  });
});
