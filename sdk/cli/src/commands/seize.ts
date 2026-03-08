import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { loadStablecoin } from "../helpers";

export const seizeCommand = new Command("seize")
  .description("Seize tokens from a blacklisted account")
  .requiredOption("--mint <address>", "Mint address")
  .requiredOption("--from <address>", "Source token account (blacklisted)")
  .requiredOption("--to <address>", "Destination token account (treasury)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    const stablecoin = await loadStablecoin(opts.mint, opts);

    const txSig = await stablecoin.compliance.seize(
      new PublicKey(opts.from),
      new PublicKey(opts.to),
    );

    console.log(`Seized tokens from ${opts.from} to ${opts.to}`);
    console.log(`Tx: ${txSig}`);
  });
