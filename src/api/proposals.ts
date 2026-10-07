import { randomUUID } from "node:crypto";
import type { PolicyEvaluation, ProposedPayout } from "../policy/types.js";

export type ProposalStatus = "pending_confirmation" | "confirmed" | "rejected";

export interface StoredProposal {
  id: string;
  payout: ProposedPayout;
  policy: PolicyEvaluation;
  status: ProposalStatus;
  createdAt: number;
  confirmedAt?: number;
}

export interface ProposalStore {
  create(payout: ProposedPayout, policy: PolicyEvaluation): StoredProposal;
  get(id: string): StoredProposal | undefined;
  markConfirmed(id: string): StoredProposal | undefined;
  list(): StoredProposal[];
}

export class InMemoryProposalStore implements ProposalStore {
  private readonly byId = new Map<string, StoredProposal>();

  create(payout: ProposedPayout, policy: PolicyEvaluation): StoredProposal {
    const id = payout.id?.trim() || randomUUID();
    const stored: StoredProposal = {
      id,
      payout: { ...payout, id },
      policy,
      status: "pending_confirmation",
      createdAt: Date.now(),
    };
    this.byId.set(id, stored);
    return stored;
  }

  get(id: string): StoredProposal | undefined {
    return this.byId.get(id);
  }

  markConfirmed(id: string): StoredProposal | undefined {
    const existing = this.byId.get(id);
    if (!existing) return undefined;
    const updated: StoredProposal = {
      ...existing,
      status: "confirmed",
      confirmedAt: Date.now(),
    };
    this.byId.set(id, updated);
    return updated;
  }

  list(): StoredProposal[] {
    return [...this.byId.values()];
  }
}
