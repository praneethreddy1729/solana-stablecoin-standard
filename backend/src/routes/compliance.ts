import { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import {
  screenAddress,
  getAuditLog,
  getAuditLogCount,
  getActionAuditLog,
  getActionAuditLogCount,
} from "../services/compliance";

interface ScreenBody {
  address: string;
}

interface AuditQuery {
  limit?: string;
  offset?: string;
}

interface EventAuditQuery {
  action?: string;
  from?: string;
  to?: string;
}

export async function complianceRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: ScreenBody }>("/compliance/screen", async (req, reply) => {
    const { address } = req.body;

    if (!address) {
      return reply.status(400).send({ error: "Missing required field: address" });
    }

    try {
      const result = await screenAddress(address);

      // Also check on-chain blacklist if SDK is available
      let onChainBlacklisted = false;
      try {
        onChainBlacklisted = await app.sdk.compliance.isBlacklisted(
          new PublicKey(address)
        );
      } catch {
        // ignore if address is invalid or lookup fails
      }

      return reply.status(200).send({
        ...result,
        onChainBlacklisted,
      });
    } catch (err: unknown) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get<{ Querystring: AuditQuery }>("/compliance/audit", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit || "100", 10), 500);
    const offset = parseInt(req.query.offset || "0", 10);

    const entries = getAuditLog(limit, offset);
    const total = getAuditLogCount();

    return reply.status(200).send({
      total,
      limit,
      offset,
      entries,
    });
  });

  app.get<{ Querystring: AuditQuery }>("/compliance/audit/actions", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit || "100", 10), 500);
    const offset = parseInt(req.query.offset || "0", 10);

    const entries = getActionAuditLog(limit, offset);
    const total = getActionAuditLogCount();

    return reply.status(200).send({ total, limit, offset, entries });
  });

  app.get<{ Querystring: EventAuditQuery }>("/compliance/audit/events", async (req, reply) => {
    const { action, from, to } = req.query;

    let events = app.eventPoller.getAllEvents();

    // Filter by action: match log lines containing the action string (e.g. "mint", "burn")
    if (action) {
      const needle = action.toLowerCase();
      events = events.filter((e) =>
        e.logs.some((log) => log.toLowerCase().includes(needle))
      );
    }

    // Filter by date range using blockTime (unix seconds)
    if (from) {
      const fromTime = Math.floor(new Date(from).getTime() / 1000);
      events = events.filter((e) => e.blockTime !== null && e.blockTime >= fromTime);
    }
    if (to) {
      const toTime = Math.floor(new Date(to).getTime() / 1000);
      events = events.filter((e) => e.blockTime !== null && e.blockTime <= toTime);
    }

    return reply.status(200).send({
      total: events.length,
      events,
    });
  });
}
