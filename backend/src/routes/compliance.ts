import { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import {
  screenAddress,
  addAuditEntry,
  getAuditLog,
  getAuditLogCount,
  getActionAuditLog,
  getActionAuditLogCount,
} from "../services/compliance";
import { sendWebhook } from "../services/webhook";

interface ScreenBody {
  address: string;
}

interface BlacklistAddBody {
  address: string;
  reason?: string;
}

interface BlacklistRemoveBody {
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

  app.post<{ Body: BlacklistAddBody }>("/compliance/blacklist/add", async (req, reply) => {
    const { address, reason } = req.body;

    if (!address) {
      return reply.status(400).send({ error: "Missing required field: address" });
    }

    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(address);
    } catch {
      return reply.status(400).send({ error: "Invalid address" });
    }

    if (process.env.ENABLE_SANCTIONS_SCREENING === "true") {
      try {
        const result = await screenAddress(address);
        if (result.sanctioned) {
          return reply.status(403).send({ error: "Address is sanctioned", screening: result });
        }
      } catch (err: unknown) {
        app.log.error(err, "Sanctions screening failed");
        return reply.status(503).send({ error: "Sanctions screening unavailable" });
      }
    }

    try {
      const signature = await app.sdk.compliance.blacklistAdd(pubkey, reason);

      addAuditEntry({
        timestamp: new Date().toISOString(),
        action: "blacklist_add",
        actor: app.authority.publicKey.toBase58(),
        txSignature: signature,
        details: { address, ...(reason ? { reason } : {}) },
      });

      sendWebhook("blacklist_add", { signature, address, reason }).catch(
        (err: unknown) => app.log.warn(`Webhook delivery failed: ${err instanceof Error ? err.message : String(err)}`)
      );

      return reply.status(200).send({ signature, address, reason: reason || null });
    } catch (err: unknown) {
      app.log.error(err, "Blacklist add failed");
      return reply.status(500).send({ error: "Transaction failed" });
    }
  });

  app.post<{ Body: BlacklistRemoveBody }>("/compliance/blacklist/remove", async (req, reply) => {
    const { address } = req.body;

    if (!address) {
      return reply.status(400).send({ error: "Missing required field: address" });
    }

    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(address);
    } catch {
      return reply.status(400).send({ error: "Invalid address" });
    }

    try {
      const signature = await app.sdk.compliance.blacklistRemove(pubkey, app.authority.publicKey);

      addAuditEntry({
        timestamp: new Date().toISOString(),
        action: "blacklist_remove",
        actor: app.authority.publicKey.toBase58(),
        txSignature: signature,
        details: { address },
      });

      sendWebhook("blacklist_remove", { signature, address }).catch(
        (err: unknown) => app.log.warn(`Webhook delivery failed: ${err instanceof Error ? err.message : String(err)}`)
      );

      return reply.status(200).send({ signature, address });
    } catch (err: unknown) {
      app.log.error(err, "Blacklist remove failed");
      return reply.status(500).send({ error: "Transaction failed" });
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
