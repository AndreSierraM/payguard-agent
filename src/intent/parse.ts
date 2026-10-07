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
 * - "send 90 dollars to charlie@example.com for lunch"
 * - "transfer $50 to Alice memo October invoice"
 * - "please pay dana 120 USD — contractor fee"
 * - "please pay dana 120 USD - contractor fee"
 * - "send 90 dollars to charlie for lunch"
 * - "pay bob 50 notes test note"
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

  let recipientName: string | undefined;
  if (!recipient) {
    for (const name of Object.keys(NAME_TO_EMAIL)) {
      const re = new RegExp(`\\b${name}\\b`, "i");
      if (re.test(text)) {
        recipient = NAME_TO_EMAIL[name];
        recipientName = name;
        break;
      }
    }
  }

  if (!recipient) return null;

  const memo = extractMemo(text, recipient, recipientName, emailMatch?.index);

  return {
    amount,
    currency,
    recipient,
    memo,
    raw: text,
  };
}

function extractMemo(
  text: string,
  recipient: string,
  recipientName: string | undefined,
  emailIndex: number | undefined
): string | undefined {
  let searchStart = 0;
  if (emailIndex !== undefined) {
    searchStart = emailIndex + recipient.length;
  } else if (recipientName) {
    const nameMatch = text.match(new RegExp(`\\b${recipientName}\\b`, "i"));
    if (nameMatch?.index !== undefined) {
      searchStart = nameMatch.index + recipientName.length;
    }
  }

  let afterRecipient = text.slice(searchStart).trim();

  const forMatch = afterRecipient.match(/^for\s+(.+)$/i);
  if (forMatch) return forMatch[1].trim();

  const memoMatch = afterRecipient.match(/^memo\s+(.+)$/i);
  if (memoMatch) return memoMatch[1].trim();

  const dashMatch = afterRecipient.match(/^[—\-]\s*(.+)$/);
  if (dashMatch) return dashMatch[1].trim();

  const notesMatch = afterRecipient.match(/^notes\s+(.+)$/i);
  if (notesMatch) return notesMatch[1].trim();

  const lowerAfter = afterRecipient.toLowerCase();
  const forIdx = lowerAfter.indexOf(" for ");
  if (forIdx >= 0) return afterRecipient.slice(forIdx + 5).trim();

  const memoIdx = lowerAfter.indexOf(" memo ");
  if (memoIdx >= 0) return afterRecipient.slice(memoIdx + 6).trim();

  const notesIdx = lowerAfter.indexOf(" notes ");
  if (notesIdx >= 0) return afterRecipient.slice(notesIdx + 7).trim();

  const fullTextLower = text.toLowerCase();
  const currencyMatch = text.match(/\b(USD|EUR|GBP|CAD|AUD|MXN)\b/i);
  if (currencyMatch?.index !== undefined) {
    const afterCurrency = text.slice(currencyMatch.index + currencyMatch[0].length).trim();
    const dashMatch2 = afterCurrency.match(/^[—\-]\s*(.+)$/);
    if (dashMatch2) return dashMatch2[1].trim();
  }

  return undefined;
}

export { NAME_TO_EMAIL };
