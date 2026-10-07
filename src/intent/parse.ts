/**
 * Tiny NL-ish intent parser for the demo UI / optional API field `intent`.
 * Maps first-name shortcuts → seed emails. Charlie is deliberately NOT seeded.
 */

const NAME_TO_EMAIL: Record<string, string> = {
  alice: "alice@example.com",
  bob: "bob@example.com",
  charlie: "charlie@example.com",
  dana: "dana@example.com",
};

export interface ParsedIntent {
  amount: number;
  currency: string;
  recipient: string;
  memo?: string;
  raw: string;
}

/**
 * Parse strings like:
 * - "Pay Bob $2500"
 * - "pay alice 50 usd"
 * - "Send $90 to charlie@example.com"
 */
export function parseIntent(raw: string): ParsedIntent | null {
  const text = raw.trim();
  if (!text) return null;

  const currencyMatch = text.match(/\b(USD|EUR|GBP|CAD|AUD|MXN)\b/i);
  const currency = (currencyMatch?.[1] ?? "USD").toUpperCase();

  const amountMatch =
    text.match(/\$\s*([\d]+(?:\.\d+)?)/) ??
    text.match(/\b([\d]+(?:\.\d+)?)\s*(?:USD|EUR|GBP|dollars?)?\b/i);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  let recipient: string | undefined = emailMatch?.[0];

  if (!recipient) {
    for (const name of Object.keys(NAME_TO_EMAIL)) {
      const re = new RegExp(`\\b${name}\\b`, "i");
      if (re.test(text)) {
        recipient = NAME_TO_EMAIL[name];
        break;
      }
    }
  }

  if (!recipient) return null;

  return {
    amount,
    currency,
    recipient,
    memo: text,
    raw: text,
  };
}

export { NAME_TO_EMAIL };
