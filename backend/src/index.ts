import "dotenv/config";
import Fastify from "fastify";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as path from "path";

import { SolanaStablecoin } from "../../sdk/core/src";
import { healthRoutes } from "./routes/health";
import { mintRoutes } from "./routes/mint";
import { burnRoutes } from "./routes/burn";
import { complianceRoutes } from "./routes/compliance";
import { statusRoutes } from "./routes/status";
import { EventPoller } from "./services/event-poller";
import { apiKeyAuth } from "./middleware/auth";

declare module "fastify" {
  interface FastifyInstance {
    sdk: SolanaStablecoin;
    connection: Connection;
    authority: Keypair;
    eventPoller: EventPoller;
  }
}

async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || "http://127.0.0.1:8899";
  const port = parseInt(process.env.PORT || "3001", 10);
  const host = process.env.HOST || "0.0.0.0";

  const keypairPath =
    process.env.AUTHORITY_KEYPAIR?.replace("~", process.env.HOME || "~") ||
    path.join(process.env.HOME || "", ".config/solana/id.json");

  const app = Fastify({ logger: true });

  let authority: Keypair;
  try {
    const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    authority = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  } catch (err: any) {
    app.log.error(`Failed to load keypair from ${keypairPath}: ${err.message}`);
    process.exit(1);
  }

  const mintAddress = process.env.MINT_ADDRESS;
  if (!mintAddress) {
    app.log.error("MINT_ADDRESS env var is required");
    process.exit(1);
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new Wallet(authority);

  const sdk = await SolanaStablecoin.load(
    connection,
    wallet,
    new PublicKey(mintAddress)
  );

  app.log.info(`RPC: ${rpcUrl}`);
  app.log.info(`Authority: ${authority.publicKey.toBase58()}`);
  app.log.info(`Mint: ${mintAddress}`);

  const eventPoller = new EventPoller(connection, sdk.configPda, {
    intervalMs: 5000,
    maxEvents: 1000,
  }, app.log);

  app.decorate("sdk", sdk);
  app.decorate("connection", connection);
  app.decorate("authority", authority);
  app.decorate("eventPoller", eventPoller);

  // CORS configuration
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:3000"];

  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin || "";
    if (allowedOrigins.includes(origin)) {
      reply.header("Access-Control-Allow-Origin", origin);
    }
    reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    reply.header("Vary", "Origin");
    if (req.method === "OPTIONS") {
      reply.status(204).send();
    }
  });

  // API key authentication for protected routes
  app.addHook("onRequest", apiKeyAuth);

  await app.register(healthRoutes);
  await app.register(mintRoutes);
  await app.register(burnRoutes);
  await app.register(complianceRoutes);
  await app.register(statusRoutes);

  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/events",
    async (req, reply) => {
      const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
      const offset = parseInt(req.query.offset || "0", 10);
      const events = eventPoller.getEvents(limit, offset);
      return reply.send({
        total: eventPoller.getEventCount(),
        limit,
        offset,
        events,
      });
    }
  );

  try {
    await app.listen({ port, host });
    eventPoller.start();
    app.log.info(`Backend listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async () => {
    eventPoller.stop();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
