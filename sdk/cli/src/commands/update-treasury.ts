import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { loadStablecoin } from "../helpers";

export const updateTreasuryCommand = new Command("update-treasury")
  .description("Update the treasury token account")
  .requiredOption("--mint <address>", "Mint address")
  .requiredOption("--new-treasury <address>", "New treasury token account pubkey")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    try {
      const stablecoin = await loadStablecoin(opts.mint, opts);
      const newTreasury = new PublicKey(opts.newTreasury);

      const txSig = await stablecoin.updateTreasury(newTreasury);

      console.log(`Treasury updated to ${opts.newTreasury}`);
      console.log(`Tx: ${txSig}`);
    } catch (err: unknown) {
      console.error(`Failed to update treasury: ${(err as Error).message}`);
      process.exit(1);
    }
  });
