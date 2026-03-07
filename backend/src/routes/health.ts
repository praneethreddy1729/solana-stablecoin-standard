import { FastifyInstance } from "fastify";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_req, reply) => {
    const health: {
      status: string;
      rpc: { connected: boolean; endpoint: string; slot?: number; error?: string };
      mint?: { address: string; exists: boolean; supply?: string; error?: string };
    } = {
      status: "ok",
      rpc: {
        connected: false,
        endpoint: app.connection.rpcEndpoint,
      },
    };

    try {
      const slot = await app.connection.getSlot("confirmed");
      health.rpc.connected = true;
      health.rpc.slot = slot;
    } catch (err: any) {
      health.status = "degraded";
      health.rpc.error = err.message;
    }

    const sdk = app.sdk;
    try {
      const mint = await getMint(
        app.connection,
        sdk.mint,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      health.mint = {
        address: sdk.mint.toBase58(),
        exists: true,
        supply: mint.supply.toString(),
      };
    } catch (err: any) {
      health.mint = {
        address: sdk.mint.toBase58(),
        exists: false,
        error: err.message,
      };
    }

    reply.status(health.status === "ok" ? 200 : 503).send(health);
  });
}
