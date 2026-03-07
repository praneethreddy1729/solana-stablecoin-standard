import { FastifyInstance } from "fastify";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

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

    try {
      const sdk = app.sdk;

      const signature = await sdk.burn({
        amount: amountBn,
        from: fromPubkey,
        fromAuthority: fromAuthorityPubkey,
        burner: app.authority.publicKey,
      });

      return reply.status(200).send({
        signature,
        mint: sdk.mint.toBase58(),
        from,
        amount,
      });
    } catch (err: any) {
      app.log.error(err, "Burn transaction failed");
      return reply.status(500).send({
        error: "Burn transaction failed",
        details: err.message,
      });
    }
  });
}
