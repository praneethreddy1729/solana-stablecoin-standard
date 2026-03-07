import { FastifyInstance } from "fastify";
import { getMint, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

export async function statusRoutes(app: FastifyInstance): Promise<void> {
  app.get("/status", async (_req, reply) => {
    try {
      const sdk = app.sdk;
      const mintInfo = await getMint(
        app.connection,
        sdk.mint,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );

      const config = await sdk.getConfig();

      return reply.status(200).send({
        mint: {
          address: sdk.mint.toBase58(),
          decimals: mintInfo.decimals,
          supply: mintInfo.supply.toString(),
          isInitialized: mintInfo.isInitialized,
          freezeAuthority: mintInfo.freezeAuthority?.toBase58() || null,
          mintAuthority: mintInfo.mintAuthority?.toBase58() || null,
        },
        config: {
          authority: config.authority.toBase58(),
          mint: config.mint.toBase58(),
          paused: config.paused,
          enableTransferHook: config.enableTransferHook,
          enablePermanentDelegate: config.enablePermanentDelegate,
          defaultAccountFrozen: config.defaultAccountFrozen,
          decimals: config.decimals,
        },
      });
    } catch (err: any) {
      return reply.status(500).send({
        error: "Failed to fetch status",
        details: err.message,
      });
    }
  });
}
