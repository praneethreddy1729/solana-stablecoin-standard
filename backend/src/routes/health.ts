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
    } catch (err: unknown) {
      health.status = "degraded";
      health.rpc.error = err instanceof Error ? err.message : String(err);
    }

    const sdk = app.sdk;
    try {
      const mint = await getMint(
        app.connection,
        sdk.mintAddress,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      health.mint = {
        address: sdk.mintAddress.toBase58(),
        exists: true,
        supply: mint.supply.toString(),
      };
    } catch (err: unknown) {
      health.mint = {
        address: sdk.mintAddress.toBase58(),
        exists: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    reply.status(health.status === "ok" ? 200 : 503).send(health);
  });
}
