import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { loadStablecoin } from "../helpers";

export const transferAuthorityCommand = new Command("transfer-authority")
  .description("Initiate authority transfer to a new address")
  .requiredOption("--mint <address>", "Mint address")
  .requiredOption("--new-authority <address>", "New authority pubkey")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    try {
      const stablecoin = await loadStablecoin(opts.mint, opts);
      const newAuthority = new PublicKey(opts.newAuthority);

      const txSig = await stablecoin.transferAuthority(newAuthority);

      console.log(`Authority transfer initiated to ${opts.newAuthority}`);
      console.log(`Tx: ${txSig}`);
    } catch (err: unknown) {
      console.error(`Failed to transfer authority: ${(err as Error).message}`);
      process.exit(1);
    }
  });
