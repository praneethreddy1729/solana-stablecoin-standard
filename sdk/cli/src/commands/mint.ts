import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { loadStablecoin, loadWallet, parseAmount } from "../helpers";

export const mintCommand = new Command("mint [recipient] [amount]")
  .description("Mint tokens")
  .requiredOption("--mint <address>", "Mint address")
  .option("--to <address>", "Recipient token account")
  .option("--amount <amount>", "Amount to mint (e.g. 1.5 for human-readable or 1500000 for raw units)")
  .option("--decimals <number>", "Token decimals for human-readable amounts", "6")
  .option("--minter <address>", "Minter pubkey (defaults to wallet)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (recipient, amount, opts) => {
    const recipientAddr = recipient || opts.to;
    const mintAmountStr = amount || opts.amount;

    if (!recipientAddr) {
      console.error("Error: recipient address is required (positional arg or --to)");
      process.exit(1);
    }
    if (!mintAmountStr) {
      console.error("Error: amount is required (positional arg or --amount)");
      process.exit(1);
    }

    try {
      const wallet = loadWallet(opts.keypair);
      const stablecoin = await loadStablecoin(opts.mint, opts);
      const minter = opts.minter
        ? new PublicKey(opts.minter)
        : wallet.publicKey;

      const decimals = parseInt(opts.decimals, 10);
      const parsedAmount = parseAmount(mintAmountStr, decimals);

      const txSig = await stablecoin.mint(
        new PublicKey(recipientAddr),
        parsedAmount,
        minter,
      );

      console.log(`Minted ${mintAmountStr} tokens (${parsedAmount.toString()} base units) to ${recipientAddr}`);
      console.log(`Tx: ${txSig}`);
    } catch (err: unknown) {
      console.error(`Failed to mint: ${(err as Error).message}`);
      process.exit(1);
    }
  });
