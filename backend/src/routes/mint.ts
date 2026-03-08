import { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { screenAddress, addAuditEntry } from "../services/compliance";
import { sendWebhook } from "../services/webhook";

interface MintBody {
  to: string;
  amount: string;
}

export async function mintRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: MintBody }>("/mint", async (req, reply) => {
    const { to, amount } = req.body;

    if (!to || !amount) {
      return reply.status(400).send({ error: "Missing required fields: to, amount" });
    }

    let toPubkey: PublicKey;
    try {
      toPubkey = new PublicKey(to);
    } catch {
      return reply.status(400).send({ error: "Invalid 'to' address" });
    }

    let amountBn: BN;
    try {
      amountBn = new BN(amount);
      if (amountBn.lte(new BN(0))) throw new Error();
    } catch {
      return reply.status(400).send({ error: "Invalid amount: must be a positive integer string" });
    }

    if (process.env.ENABLE_SANCTIONS_SCREENING === "true") {
      const result = await screenAddress(to);
      if (result.sanctioned) {
        return reply.status(403).send({ error: "Address is sanctioned", screening: result });
      }
    }

    try {
      const sdk = app.sdk;
      const toAta = getAssociatedTokenAddressSync(
        sdk.mintAddress,
        toPubkey,
        true,
        TOKEN_2022_PROGRAM_ID
      );

      const signature = await sdk.mint(
        toAta,
        amountBn,
        app.authority.publicKey,
      );

      const mintAddress = sdk.mintAddress.toBase58();

      addAuditEntry({
        timestamp: new Date().toISOString(),
        action: "mint",
        actor: app.authority.publicKey.toBase58(),
        txSignature: signature,
        details: { mint: mintAddress, to, amount },
      });

      sendWebhook("mint", { signature, mint: mintAddress, to, amount }).catch(
        () => {}
      );

      return reply.status(200).send({
        signature,
        mint: mintAddress,
        to,
        amount,
      });
    } catch (err: any) {
      app.log.error(err, "Mint transaction failed");
      return reply.status(500).send({
        error: "Mint transaction failed",
        details: err.message,
      });
    }
  });
}
