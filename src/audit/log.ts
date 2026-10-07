import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type AuditEventType = "propose" | "block" | "confirm" | "cancel";

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  at: string;
  /** Epoch ms */
  ts: number;
  decision?: string;
  proposalId?: string;
  payoutId?: string;
  amount?: number;
  currency?: string;
  recipient?: string;
  reasons?: string[];
  details?: Record<string, unknown>;
}

const RING_MAX = 500;

/**
 * Append-only audit log: in-memory ring + optional JSONL file under data/.
 */
export class AuditLog {
  private readonly ring: AuditEvent[] = [];
  private readonly filePath: string | null;
  private seq = 0;

  constructor(opts: { filePath?: string | null; enableFile?: boolean } = {}) {
    if (opts.enableFile === false) {
      this.filePath = null;
    } else {
      this.filePath =
        opts.filePath ?? resolve(process.cwd(), "data", "audit.jsonl");
      try {
        mkdirSync(dirname(this.filePath), { recursive: true });
      } catch {
        /* ignore — file append will also fail soft */
      }
    }
  }

  append(
    type: AuditEventType,
    payload: Omit<AuditEvent, "id" | "type" | "at" | "ts"> = {},
  ): AuditEvent {
    this.seq += 1;
    const ts = Date.now();
    const event: AuditEvent = {
      id: `aud-${ts}-${this.seq}`,
      type,
      at: new Date(ts).toISOString(),
      ts,
      ...payload,
    };
    this.ring.push(event);
    if (this.ring.length > RING_MAX) {
      this.ring.splice(0, this.ring.length - RING_MAX);
    }
    if (this.filePath) {
      try {
        appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, "utf8");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[payguard:audit] file append failed: ${message}`);
      }
    }
    return event;
  }

  list(): AuditEvent[] {
    return [...this.ring];
  }

  clear(): void {
    this.ring.length = 0;
  }
}
