import { Command } from "commander";
import { loadStablecoin } from "../helpers";

export const cancelAuthorityTransferCommand = new Command("cancel-authority-transfer")
  .description("Cancel a pending authority transfer")
  .requiredOption("--mint <address>", "Mint address")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (opts) => {
    try {
      const stablecoin = await loadStablecoin(opts.mint, opts);

      const txSig = await stablecoin.cancelAuthorityTransfer();

      console.log(`Authority transfer cancelled`);
      console.log(`Tx: ${txSig}`);
    } catch (err: unknown) {
      console.error(`Failed to cancel authority transfer: ${(err as Error).message}`);
      process.exit(1);
    }
  });
