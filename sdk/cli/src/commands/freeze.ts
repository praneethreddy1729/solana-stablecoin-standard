import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { loadStablecoin, loadWallet } from "../helpers";

export const freezeCommand = new Command("freeze [address]")
  .description("Freeze a token account")
  .requiredOption("--mint <address>", "Mint address")
  .option("--account <address>", "Token account to freeze")
  .option("--freezer <address>", "Freezer pubkey (defaults to wallet)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (address, opts) => {
    const tokenAccount = address || opts.account;

    if (!tokenAccount) {
      console.error("Error: token account is required (positional arg or --account)");
      process.exit(1);
    }

    const wallet = loadWallet(opts.keypair);
    const stablecoin = await loadStablecoin(opts.mint, opts);
    const freezer = opts.freezer
      ? new PublicKey(opts.freezer)
      : wallet.publicKey;

    const txSig = await stablecoin.freeze({
      tokenAccount: new PublicKey(tokenAccount),
      freezer,
    });

    console.log(`Frozen account: ${tokenAccount}`);
    console.log(`Tx: ${txSig}`);
  });

export const thawCommand = new Command("thaw [address]")
  .description("Thaw a frozen token account")
  .requiredOption("--mint <address>", "Mint address")
  .option("--account <address>", "Token account to thaw")
  .option("--freezer <address>", "Freezer pubkey (defaults to wallet)")
  .option("--rpc-url <url>", "RPC URL")
  .option("--keypair <path>", "Keypair file path")
  .action(async (address, opts) => {
    const tokenAccount = address || opts.account;

    if (!tokenAccount) {
      console.error("Error: token account is required (positional arg or --account)");
      process.exit(1);
    }

    const wallet = loadWallet(opts.keypair);
    const stablecoin = await loadStablecoin(opts.mint, opts);
    const freezer = opts.freezer
      ? new PublicKey(opts.freezer)
      : wallet.publicKey;

    const txSig = await stablecoin.thaw({
      tokenAccount: new PublicKey(tokenAccount),
      freezer,
    });

    console.log(`Thawed account: ${tokenAccount}`);
    console.log(`Tx: ${txSig}`);
  });
