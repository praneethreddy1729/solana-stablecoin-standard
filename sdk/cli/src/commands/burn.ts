import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { loadStablecoin, loadWallet } from "../helpers";

export const burnCommand = new Command("burn [amount]")
  .description("Burn tokens")
  .requiredOption("--mint <address>", "Mint address")
  .option("--from <address>", "Source token account")
  .option("--amount <amount>", "Amount to burn (raw units)")
  .option("--from-authority <address>", "Token account authority (defaults to wallet)")
  .option("--burner <address>", "Burner pubkey (defaults to wallet)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (amount, opts) => {
    const burnAmount = amount || opts.amount;

    if (!opts.from) {
      console.error("Error: source account is required (--from)");
      process.exit(1);
    }
    if (!burnAmount) {
      console.error("Error: amount is required (positional arg or --amount)");
      process.exit(1);
    }

    const wallet = loadWallet(opts.keypair);
    const stablecoin = await loadStablecoin(opts.mint, opts);
    const burner = opts.burner
      ? new PublicKey(opts.burner)
      : wallet.publicKey;
    const fromAuthority = opts.fromAuthority
      ? new PublicKey(opts.fromAuthority)
      : wallet.publicKey;

    const txSig = await stablecoin.burn(
      new PublicKey(opts.from),
      new BN(burnAmount),
      burner,
      fromAuthority,
    );

    console.log(`Burned ${burnAmount} tokens from ${opts.from}`);
    console.log(`Tx: ${txSig}`);
  });
