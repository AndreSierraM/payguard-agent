import type { RecordedPayout } from "./types.js";

/**
 * Injectable store of recent payouts for velocity / spend / duplicate checks.
 * In-memory is fine for the hackathon demo; swap for Redis/DB later.
 */
export interface PayoutHistoryStore {
  list(): RecordedPayout[];
  add(payout: RecordedPayout): void;
  clear(): void;
}

export class InMemoryPayoutHistoryStore implements PayoutHistoryStore {
  private readonly items: RecordedPayout[] = [];

  list(): RecordedPayout[] {
    return [...this.items];
  }

  add(payout: RecordedPayout): void {
    this.items.push(payout);
  }

  clear(): void {
    this.items.length = 0;
  }
}
