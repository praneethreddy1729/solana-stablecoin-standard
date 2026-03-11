import { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { screenAddress, addAuditEntry } from "../services/compliance";
import { sendWebhook } from "../services/webhook";

interface BurnBody {
  from: string;
  fromAuthority: string;
  amount: string;
}

export async function burnRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: BurnBody }>("/burn", async (req, reply) => {
    const { from, fromAuthority, amount } = req.body;

    if (!from || !fromAuthority || !amount) {
      return reply.status(400).send({
        error: "Missing required fields: from, fromAuthority, amount",
      });
    }

    let fromPubkey: PublicKey;
    let fromAuthorityPubkey: PublicKey;
    try {
      fromPubkey = new PublicKey(from);
      fromAuthorityPubkey = new PublicKey(fromAuthority);
    } catch {
      return reply.status(400).send({ error: "Invalid address" });
    }

    let amountBn: BN;
    try {
      amountBn = new BN(amount);
      if (amountBn.lte(new BN(0))) throw new Error();
    } catch {
      return reply.status(400).send({
        error: "Invalid amount: must be a positive integer string",
      });
    }

    if (process.env.ENABLE_SANCTIONS_SCREENING === "true") {
      try {
        const result = await screenAddress(fromAuthority);
        if (result.sanctioned) {
          return reply.status(403).send({ error: "Address is sanctioned", screening: result });
        }
      } catch (err: unknown) {
        app.log.error(err, "Sanctions screening failed");
        return reply.status(503).send({ error: "Sanctions screening unavailable" });
      }
    }

    try {
      const sdk = app.sdk;

      const signature = await sdk.burn(
        fromPubkey,
        amountBn,
        app.authority.publicKey,
        fromAuthorityPubkey,
      );

      const mintAddress = sdk.mintAddress.toBase58();

      addAuditEntry({
        timestamp: new Date().toISOString(),
        action: "burn",
        actor: app.authority.publicKey.toBase58(),
        txSignature: signature,
        details: { mint: mintAddress, from, amount },
      });

      sendWebhook("burn", { signature, mint: mintAddress, from, amount }).catch(
        (err: unknown) => app.log.warn('Webhook delivery failed:', err instanceof Error ? err.message : String(err))
      );

      return reply.status(200).send({
        signature,
        mint: mintAddress,
        from,
        amount,
      });
    } catch (err: unknown) {
      app.log.error(err, "Burn transaction failed");
      return reply.status(500).send({
        error: "Transaction failed",
      });
    }
  });
}
