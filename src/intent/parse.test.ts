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

  it("parses send 90 dollars to charlie@example.com for lunch", () => {
    const p = parseIntent("send 90 dollars to charlie@example.com for lunch");
    assert.ok(p);
    assert.equal(p!.amount, 90);
    assert.equal(p!.currency, "USD");
    assert.equal(p!.recipient, "charlie@example.com");
    assert.equal(p!.memo, "lunch");
  });

  it("parses transfer $50 to Alice memo October invoice", () => {
    const p = parseIntent("transfer $50 to Alice memo October invoice");
    assert.ok(p);
    assert.equal(p!.amount, 50);
    assert.equal(p!.currency, "USD");
    assert.equal(p!.recipient, "alice@example.com");
    assert.equal(p!.memo, "October invoice");
  });

  it("parses please pay dana 120 USD — contractor fee (em dash)", () => {
    const p = parseIntent("please pay dana 120 USD — contractor fee");
    assert.ok(p);
    assert.equal(p!.amount, 120);
    assert.equal(p!.currency, "USD");
    assert.equal(p!.recipient, "dana@example.com");
    assert.equal(p!.memo, "contractor fee");
  });

  it("parses please pay dana 120 USD - contractor fee (hyphen)", () => {
    const p = parseIntent("please pay dana 120 USD - contractor fee");
    assert.ok(p);
    assert.equal(p!.amount, 120);
    assert.equal(p!.currency, "USD");
    assert.equal(p!.recipient, "dana@example.com");
    assert.equal(p!.memo, "contractor fee");
  });

  it("parses send 90 dollars to charlie for lunch (name shortcut)", () => {
    const p = parseIntent("send 90 dollars to charlie for lunch");
    assert.ok(p);
    assert.equal(p!.amount, 90);
    assert.equal(p!.currency, "USD");
    assert.equal(p!.recipient, "charlie@example.com");
    assert.equal(p!.memo, "lunch");
  });

  it("parses transfer 100 EUR to Alice", () => {
    const p = parseIntent("transfer 100 EUR to Alice");
    assert.ok(p);
    assert.equal(p!.amount, 100);
    assert.equal(p!.currency, "EUR");
    assert.equal(p!.recipient, "alice@example.com");
  });

  it("parses pay 200 to bob (bare number, no $)", () => {
    const p = parseIntent("pay 200 to bob");
    assert.ok(p);
    assert.equal(p!.amount, 200);
    assert.equal(p!.currency, "USD");
    assert.equal(p!.recipient, "bob@example.com");
  });

  it("parses send 50 to frank@test.com (arbitrary email)", () => {
    const p = parseIntent("send 50 to frank@test.com");
    assert.ok(p);
    assert.equal(p!.amount, 50);
    assert.equal(p!.currency, "USD");
    assert.equal(p!.recipient, "frank@test.com");
  });

  it("parses memo via notes marker", () => {
    const p = parseIntent("pay bob 50 notes test note");
    assert.ok(p);
    assert.equal(p!.memo, "test note");
  });

  it("returns null for unknown recipient name", () => {
    const p = parseIntent("pay eve 100");
    assert.equal(p, null);
  });

  it("returns null for unknown name with currency code", () => {
    const p = parseIntent("Pay Zoe 50 USD");
    assert.equal(p, null);
  });

  it("returns null when no amount", () => {
    const p = parseIntent("pay alice");
    assert.equal(p, null);
  });

  it("returns null for empty string", () => {
    const p = parseIntent("");
    assert.equal(p, null);
  });

  it("returns null for whitespace only", () => {
    const p = parseIntent("   ");
    assert.equal(p, null);
  });
});
