import {
  Connection,
  PublicKey,
  ConfirmedSignatureInfo,
  ParsedTransactionWithMeta,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

export interface ProgramEvent {
  signature: string;
  slot: number;
  blockTime: number | null;
  logs: string[];
  err: any;
}

interface Logger {
  info(msg: string): void;
  error(msg: string | object, ...args: any[]): void;
}

const defaultLogger: Logger = {
  info: (msg) => {},
  error: (msg) => {},
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");

export class EventPoller {
  private connection: Connection;
  private configPda: PublicKey;
  private lastSignature: string | null = null;
  private events: ProgramEvent[] = [];
  private maxEvents: number;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private log: Logger;

  constructor(
    connection: Connection,
    configPda: PublicKey,
    opts: { intervalMs?: number; maxEvents?: number } = {},
    logger?: Logger
  ) {
    this.connection = connection;
    this.configPda = configPda;
    this.maxEvents = opts.maxEvents || 1000;
    this.intervalMs = opts.intervalMs || 5000;
    this.log = logger || defaultLogger;

    this.loadFromDisk();
  }

  start(): void {
    if (this.timer) return;
    this.log.info(
      `EventPoller: starting (interval=${this.intervalMs}ms, configPda=${this.configPda.toBase58()})`
    );
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.log.info("EventPoller: stopped");
    }
  }

  getEvents(limit = 50, offset = 0): ProgramEvent[] {
    const sorted = [...this.events].reverse();
    return sorted.slice(offset, offset + limit);
  }

  getEventCount(): number {
    return this.events.length;
  }

  getAllEvents(): ProgramEvent[] {
    return [...this.events];
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(EVENTS_FILE)) {
        const raw = fs.readFileSync(EVENTS_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.events = parsed;
          if (this.events.length > 0) {
            this.lastSignature = this.events[this.events.length - 1].signature;
          }
          this.log.info(`EventPoller: loaded ${this.events.length} events from disk`);
        }
      }
    } catch (err) {
      this.log.error("EventPoller: failed to load events from disk:", err);
    }
  }

  private saveToDisk(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(EVENTS_FILE, JSON.stringify(this.events, null, 2));
    } catch (err) {
      this.log.error("EventPoller: failed to save events to disk:", err);
    }
  }

  private async poll(): Promise<void> {
    try {
      const opts: { limit: number; until?: string } = { limit: 25 };
      if (this.lastSignature) opts.until = this.lastSignature;

      const signatures: ConfirmedSignatureInfo[] =
        await this.connection.getSignaturesForAddress(this.configPda, opts);

      if (signatures.length === 0) return;

      const ordered = [...signatures].reverse();

      for (const sigInfo of ordered) {
        let logs: string[] = [];
        try {
          const tx: ParsedTransactionWithMeta | null =
            await this.connection.getParsedTransaction(sigInfo.signature, {
              commitment: "confirmed",
              maxSupportedTransactionVersion: 0,
            });
          logs = tx?.meta?.logMessages || [];
        } catch {
          // skip log fetch on error
        }

        this.events.push({
          signature: sigInfo.signature,
          slot: sigInfo.slot,
          blockTime: sigInfo.blockTime ?? null,
          logs,
          err: sigInfo.err,
        });
      }

      if (this.events.length > this.maxEvents) {
        this.events = this.events.slice(this.events.length - this.maxEvents);
      }

      this.lastSignature = signatures[0].signature;
      this.saveToDisk();
    } catch (err) {
      this.log.error("EventPoller: error polling:", err);
    }
  }
}
