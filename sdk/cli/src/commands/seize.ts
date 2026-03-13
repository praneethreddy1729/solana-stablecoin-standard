import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { loadStablecoin } from "../helpers";

export const seizeCommand = new Command("seize [address]")
  .description("Seize tokens from a blacklisted account")
  .requiredOption("--mint <address>", "Mint address")
  .option("--from <address>", "Source token account (blacklisted)")
  .option("--to <address>", "Destination token account (treasury)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (address, opts) => {
    const fromAccount = address || opts.from;

    if (!fromAccount) {
      console.error("Error: source account is required (positional arg or --from)");
      process.exit(1);
    }
    if (!opts.to) {
      console.error("Error: destination account is required (--to)");
      process.exit(1);
    }

    try {
      const stablecoin = await loadStablecoin(opts.mint, opts);

      const txSig = await stablecoin.compliance.seize(
        new PublicKey(fromAccount),
        new PublicKey(opts.to),
      );

      console.log(`Seized tokens from ${fromAccount} to ${opts.to}`);
      console.log(`Tx: ${txSig}`);
    } catch (err: unknown) {
      console.error(`Failed to seize tokens: ${(err as Error).message}`);
      process.exit(1);
    }
  });
