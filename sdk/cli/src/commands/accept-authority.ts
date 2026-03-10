import { Command } from "commander";
import { loadStablecoin } from "../helpers";

export const acceptAuthorityCommand = new Command("accept-authority")
  .description("Accept a pending authority transfer")
  .requiredOption("--mint <address>", "Mint address")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    try {
      const stablecoin = await loadStablecoin(opts.mint, opts);

      const txSig = await stablecoin.acceptAuthority();

      console.log(`Authority transfer accepted`);
      console.log(`Tx: ${txSig}`);
    } catch (err: unknown) {
      console.error(`Failed to accept authority: ${(err as Error).message}`);
      process.exit(1);
    }
  });
