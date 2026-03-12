import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { loadStablecoin, loadWallet } from "../helpers";

export const burnCommand = new Command("burn [amount]")
  .description("Burn tokens")
  .requiredOption("--mint <address>", "Mint address")
  .option("--from <address>", "Source token account (defaults to authority ATA)")
  .option("--amount <amount>", "Amount to burn (raw units)")
  .option("--from-authority <address>", "Token account authority (defaults to wallet)")
  .option("--burner <address>", "Burner pubkey (defaults to wallet)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (amount, opts) => {
    const burnAmount = amount || opts.amount;

    if (!burnAmount) {
      console.error("Error: amount is required (positional arg or --amount)");
      process.exit(1);
    }

    try {
      const wallet = loadWallet(opts.keypair);
      const stablecoin = await loadStablecoin(opts.mint, opts);
      const burner = opts.burner
        ? new PublicKey(opts.burner)
        : wallet.publicKey;
      const fromAuthority = opts.fromAuthority
        ? new PublicKey(opts.fromAuthority)
        : wallet.publicKey;

      // Default --from to the authority's ATA derived from mint + TOKEN_2022_PROGRAM_ID
      const fromAccount = opts.from
        ? new PublicKey(opts.from)
        : getAssociatedTokenAddressSync(
            new PublicKey(opts.mint),
            fromAuthority,
            false,
            TOKEN_2022_PROGRAM_ID
          );

      const txSig = await stablecoin.burn(
        fromAccount,
        new BN(burnAmount),
        burner,
        fromAuthority,
      );

      console.log(`Burned ${burnAmount} tokens from ${fromAccount.toBase58()}`);
      console.log(`Tx: ${txSig}`);
    } catch (err: unknown) {
      console.error(`Failed to burn: ${(err as Error).message}`);
      process.exit(1);
    }
  });
